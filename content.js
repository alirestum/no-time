// Extracts the transcript from a YouTube watch page using YouTube's transcript panel API.

const TRANSCRIPT_READ_ERROR = "Oh no, failed to read the transcript for this video.";
const MODERN_TRANSCRIPT_PANEL_ID = "PAmodern_transcript_view";

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function extractBalancedJsonText(src, start, openChar) {
  const closeChar = openChar === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let escape = false;

  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }

  return null;
}

function parseJsonValueAfterMarker(src, marker, openChar) {
  const idx = src.indexOf(marker);
  if (idx === -1) return null;
  const start = src.indexOf(openChar, idx + marker.length);
  if (start === -1) return null;
  const text = extractBalancedJsonText(src, start, openChar);
  return text ? JSON.parse(text) : null;
}

function parseFirstPageJson(markers) {
  for (const s of document.scripts) {
    const src = s.textContent || "";
    if (!markers.some((marker) => src.includes(marker))) continue;
    for (const marker of markers) {
      try {
        const value = parseJsonValueAfterMarker(src, marker, "{");
        if (value) return value;
      } catch {}
    }
  }
  return null;
}

function extractInnertubeContext() {
  for (const s of document.scripts) {
    const src = s.textContent || "";
    if (!src.includes('"INNERTUBE_CONTEXT"')) continue;
    try {
      const context = parseJsonValueAfterMarker(src, '"INNERTUBE_CONTEXT"', "{");
      if (context) return context;
    } catch {}
  }
  return null;
}

function getVideoId() {
  return new URLSearchParams(location.search).get("v") || "";
}

function encodeVarint(value) {
  const bytes = [];
  let n = value >>> 0;
  while (n >= 0x80) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return bytes;
}

function base64UrlFromBytes(bytes) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildModernTranscriptPanelParams(videoId) {
  if (!videoId) return "";

  const idBytes = [...new TextEncoder().encode(videoId)];
  const inner = [
    0x0a,
    ...encodeVarint(idBytes.length),
    ...idBytes,
    0x18,
    0x02,
  ];

  return base64UrlFromBytes([
    ...encodeVarint((149 << 3) | 2),
    ...encodeVarint(inner.length),
    ...inner,
  ]);
}

function walkJson(value, visit) {
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    visit(current);

    const children = Object.values(current);
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child && typeof child === "object") stack.push(child);
    }
  }
}

function extractTranscriptPanelRequests() {
  const requests = [];
  const initialData = parseFirstPageJson(["ytInitialData"]);

  if (initialData) {
    walkJson(initialData, (value) => {
      const endpoint = value.getPanelEndpoint;
      if (!endpoint?.params) return;

      const panelId = endpoint.panelId || endpoint.identifier?.tag || MODERN_TRANSCRIPT_PANEL_ID;
      const haystack = JSON.stringify({ endpoint, value }).toLowerCase();
      if (panelId !== MODERN_TRANSCRIPT_PANEL_ID && !haystack.includes("transcript")) return;

      requests.push({
        panelId,
        params: endpoint.params,
        clickTrackingParams: endpoint.clickTrackingParams || value.clickTrackingParams || "",
      });
    });
  }

  const fallbackParams = buildModernTranscriptPanelParams(getVideoId());
  if (fallbackParams) {
    requests.push({
      panelId: MODERN_TRANSCRIPT_PANEL_ID,
      params: fallbackParams,
      clickTrackingParams: "",
    });
  }

  const seen = new Set();
  return requests.filter((request) => {
    const key = `${request.panelId}:${request.params}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textFromRuns(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((run) => run.text || "").join("");
  if (value.simpleText) return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("");
  return "";
}

function extractTranscriptTextFromPanelPayload(payload) {
  const segments = [];
  walkJson(payload, (value) => {
    const segment = value.transcriptSegmentViewModel;
    if (!segment) return;

    const text =
      textFromRuns(segment) ||
      textFromRuns(segment.text) ||
      textFromRuns(segment.content);
    if (text) segments.push(text);
  });

  return normalizeText(segments.join(" "));
}

async function fetchTranscriptFromPanelApi() {
  const context = extractInnertubeContext();
  const requests = extractTranscriptPanelRequests();
  if (!context || !requests.length) return null;

  const clientVersion = context.client?.clientVersion || "";
  const headers = {
    "Content-Type": "application/json",
    "x-origin": "https://www.youtube.com",
    "x-youtube-client-name": "1",
  };
  if (clientVersion) headers["x-youtube-client-version"] = clientVersion;
  if (context.client?.visitorData) headers["x-goog-visitor-id"] = context.client.visitorData;

  for (const request of requests) {
    const requestContext = structuredClone(context);
    if (request.clickTrackingParams) {
      requestContext.clickTracking = { clickTrackingParams: request.clickTrackingParams };
    }

    try {
      const res = await fetch("/youtubei/v1/get_panel?prettyPrint=false", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          context: requestContext,
          panelId: request.panelId,
          params: request.params,
        }),
      });
      if (!res.ok) continue;

      const payload = await res.json();
      const text = extractTranscriptTextFromPanelPayload(payload);
      if (text.length > 20) return text;
    } catch {}
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "GET_TRANSCRIPT") return;

  (async () => {
    try {
      if (!location.href.includes("/watch")) {
        sendResponse({ ok: false, error: "Open a YouTube video first." });
        return;
      }

      const meta = getVideoMeta();
      const transcript = await fetchTranscriptFromPanelApi();
      if (!transcript) {
        sendResponse({ ok: false, error: TRANSCRIPT_READ_ERROR });
        return;
      }

      sendResponse({ ok: true, meta, transcript });
    } catch {
      sendResponse({ ok: false, error: TRANSCRIPT_READ_ERROR });
    }
  })();

  return true;
});
