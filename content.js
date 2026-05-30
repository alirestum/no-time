// Extracts the transcript from a YouTube watch page.
// Logs everything to the page console with [no-time] prefix for debugging.

const log = (...a) => console.log("[no-time]", ...a);
const warn = (...a) => console.warn("[no-time]", ...a);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, { timeout = 6000, interval = 150 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = predicate();
    if (v) return v;
    await sleep(interval);
  }
  return null;
}

function findTextButton(matchers) {
  // Returns the deepest clickable inner element whose label/text matches any matcher.
  // YT wraps real buttons in ytd-button-renderer; click on the wrapper often does nothing.
  const candidates = document.querySelectorAll(
    'button, tp-yt-paper-button, yt-button-shape, ytd-button-renderer, a'
  );
  for (const el of candidates) {
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    const text = (el.textContent || "").trim().toLowerCase();
    const matched = matchers.some((m) => {
      const re = m instanceof RegExp ? m : new RegExp(m, "i");
      return re.test(label) || re.test(text);
    });
    if (!matched) continue;
    // Prefer the innermost native button/anchor inside the matched element.
    const inner = el.querySelector('button, tp-yt-paper-button, a[role="button"], a');
    return inner || el;
  }
  return null;
}

function realClick(el) {
  // Dispatch a full mouse sequence — some YT custom elements ignore plain .click().
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new MouseEvent("pointerdown", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new MouseEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));
  try { el.click(); } catch {}
}

async function openTranscriptPanel() {
  const transcriptOpen = () =>
    !!(
      document.querySelector("ytd-transcript-segment-list-renderer") ||
      document.querySelector("ytd-transcript-segment-renderer") ||
      document.querySelector("ytd-transcript-renderer")
    );

  if (transcriptOpen()) {
    log("transcript panel already open");
    return true;
  }

  // 1) Try direct "Show transcript" button (often appears under description on newer YT).
  let btn = findTextButton([/^show transcript$/i, /^transcript$/i]);
  if (btn) {
    log("clicking direct transcript button", btn);
    realClick(btn);
    const ok = await waitFor(transcriptOpen, { timeout: 6000 });
    if (ok) return true;
  }

  // 2) Expand the description, then look again.
  const expand =
    document.querySelector("tp-yt-paper-button#expand") ||
    document.querySelector("#expand") ||
    document.querySelector("ytd-text-inline-expander #expand");
  if (expand) {
    log("expanding description");
    realClick(expand);
    await sleep(500);
  }
  btn = findTextButton([/show transcript/i]);
  if (btn) {
    log("clicking transcript button after expand", btn);
    realClick(btn);
    const ok = await waitFor(transcriptOpen, { timeout: 6000 });
    if (ok) return true;
  }

  // 3) Try the "..." (more actions) menu under the video.
  const more = document.querySelector('button[aria-label="More actions"]');
  if (more) {
    log("opening More actions menu");
    realClick(more);
    await sleep(400);
    btn = findTextButton([/show transcript/i, /^transcript$/i]);
    if (btn) {
      log("clicking transcript from menu", btn);
      realClick(btn);
      const ok = await waitFor(transcriptOpen, { timeout: 6000 });
      if (ok) return true;
    }
  }

  warn("could not open transcript panel");
  return false;
}

function scrapeTranscriptFromPanel() {
  // Newer YT uses segment renderers; some versions wrap them inside cue groups.
  const selectors = [
    "ytd-transcript-segment-renderer .segment-text",
    "ytd-transcript-segment-renderer yt-formatted-string.segment-text",
    "ytd-transcript-body-renderer .cue",
    "ytd-transcript-segment-list-renderer yt-formatted-string",
  ];
  for (const sel of selectors) {
    const nodes = document.querySelectorAll(sel);
    if (nodes.length) {
      const text = [...nodes].map((n) => n.textContent.trim()).filter(Boolean).join(" ");
      if (text.length > 20) {
        log(`scraped ${nodes.length} segments via ${sel}`);
        return text;
      }
    }
  }
  warn("no segments found in transcript panel");
  return null;
}

function extractCaptionTracksFromScripts() {
  // Find the captionTracks array inside any inline script, parse it without
  // relying on the full ytInitialPlayerResponse JSON (which has unbalanced braces for regex).
  for (const s of document.scripts) {
    const src = s.textContent;
    if (!src || !src.includes("captionTracks")) continue;
    const idx = src.indexOf('"captionTracks"');
    if (idx === -1) continue;
    const arrStart = src.indexOf("[", idx);
    if (arrStart === -1) continue;
    // Walk to the matching closing bracket.
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = arrStart; i < src.length; i++) {
      const c = src[i];
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          const arrText = src.slice(arrStart, i + 1);
          try {
            return JSON.parse(arrText);
          } catch (e) {
            warn("failed to parse captionTracks JSON", e);
            return null;
          }
        }
      }
    }
  }
  return null;
}

function parseJson3(body) {
  const j = JSON.parse(body);
  return (j.events || [])
    .map((e) => (e.segs || []).map((s) => s.utf8 || "").join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTimedTextXml(body) {
  const doc = new DOMParser().parseFromString(body, "text/xml");
  // srv1 uses <text>, srv3/ttml uses <p> with <s> children.
  const nodes = [...doc.getElementsByTagName("text"), ...doc.getElementsByTagName("p")];
  return nodes
    .map((n) => n.textContent || "")
    .join(" ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCaptionText(baseUrl) {
  log("fetching captions from", baseUrl);
  const attempts = [
    { suffix: "&fmt=json3", parse: parseJson3 },
    { suffix: "&fmt=srv3", parse: parseTimedTextXml },
    { suffix: "&fmt=srv1", parse: parseTimedTextXml },
    { suffix: "", parse: parseTimedTextXml },
  ];
  for (const { suffix, parse } of attempts) {
    try {
      const res = await fetch(baseUrl + suffix);
      const body = await res.text();
      log(`  ${suffix || "(no fmt)"} → ${res.status}, ${body.length} bytes`);
      if (!res.ok || !body.trim()) continue;
      const text = parse(body);
      if (text && text.length > 20) {
        log(`  parsed ${text.length} chars`);
        return text;
      }
    } catch (e) {
      warn(`  ${suffix} parse failed`, e.message);
    }
  }
  return null;
}

async function fetchTranscriptFromCaptions() {
  const tracks = extractCaptionTracksFromScripts();
  if (!tracks || !tracks.length) {
    warn("no caption tracks found on page");
    return null;
  }
  log(
    `found ${tracks.length} caption tracks`,
    tracks.map((t) => t.languageCode + (t.kind ? `(${t.kind})` : ""))
  );
  // Try preferred order, then fall through to others if a fetch returns nothing.
  const ordered = [
    ...tracks.filter((t) => t.languageCode === "en" && t.kind !== "asr"),
    ...tracks.filter((t) => t.languageCode === "en"),
    ...tracks.filter((t) => t.kind !== "asr"),
    ...tracks,
  ];
  const seen = new Set();
  for (const t of ordered) {
    if (seen.has(t.baseUrl)) continue;
    seen.add(t.baseUrl);
    const text = await fetchCaptionText(t.baseUrl);
    if (text) return text;
  }
  return null;
}

function getVideoMeta() {
  const title =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim() ||
    document.querySelector("h1.title")?.textContent?.trim() ||
    document.title.replace(/ - YouTube$/, "");
  const channel = document.querySelector("ytd-channel-name a, #channel-name a")?.textContent?.trim() || "";
  return { title, channel, url: location.href };
}

async function getTranscript() {
  let text = null;
  if (await openTranscriptPanel()) {
    // Wait briefly for segments to render after panel opens.
    await waitFor(() => document.querySelectorAll("ytd-transcript-segment-renderer").length > 5, { timeout: 4000 });
    text = scrapeTranscriptFromPanel();
  }
  if (!text) {
    log("falling back to caption tracks");
    text = await fetchTranscriptFromCaptions();
  }
  return text;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "GET_TRANSCRIPT") return;
  (async () => {
    try {
      log("GET_TRANSCRIPT received on", location.href);
      if (!location.href.includes("/watch")) {
        sendResponse({ ok: false, error: "Not a YouTube watch page." });
        return;
      }
      const meta = getVideoMeta();
      const transcript = await getTranscript();
      if (!transcript) {
        sendResponse({ ok: false, error: "No transcript or captions available for this video." });
        return;
      }
      log(`got transcript: ${transcript.length} chars`);
      sendResponse({ ok: true, meta, transcript });
    } catch (e) {
      warn("error extracting transcript", e);
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // async response
});

log("content script loaded on", location.href);
