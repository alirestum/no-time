const $ = (id) => document.getElementById(id);
const STATES = ["state-setup", "state-ready", "state-loading", "state-result"];

const PROVIDER_LABEL = { anthropic: "Claude", openai: "OpenAI" };
const PROVIDER_KEY_FIELD = { anthropic: "anthropicKey", openai: "openaiKey" };
const PROVIDER_KEY_PLACEHOLDER = { anthropic: "sk-ant-...", openai: "sk-..." };
const PROVIDER_KEY_LABEL = { anthropic: "Anthropic API key", openai: "OpenAI API key" };
const PROVIDER_KEY_LINK = {
  anthropic: { href: "https://console.anthropic.com/settings/keys", text: "console.anthropic.com" },
  openai: { href: "https://platform.openai.com/api-keys", text: "platform.openai.com" },
};

let currentTab = null;
let pollTimer = null;
let setupProvider = "anthropic";

function showState(name) {
  STATES.forEach((s) => $(s).classList.toggle("hidden", s !== name));
}

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (isError ? " error" : "");
}

function isYouTubeWatch(url) {
  return !!url && url.includes("youtube.com/watch");
}

// ---------- HTML sanitization ----------
const ALLOWED = new Set([
  "H2", "H3", "H4", "P", "UL", "OL", "LI",
  "STRONG", "B", "EM", "I", "CODE", "BLOCKQUOTE", "BR", "HR",
]);

function sanitizeHtml(dirty) {
  const cleaned = String(dirty)
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const doc = new DOMParser().parseFromString(`<div id="r">${cleaned}</div>`, "text/html");
  const root = doc.getElementById("r");
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED.has(child.tagName)) {
          node.replaceChild(doc.createTextNode(child.textContent || ""), child);
          return;
        }
        [...child.attributes].forEach((a) => child.removeAttribute(a.name));
        walk(child);
      }
    });
  };
  walk(root);
  return root.innerHTML;
}

// ---------- State renderers ----------
function showLoading(text = "Summarizing…") {
  $("loadingText").textContent = text;
  showState("state-loading");
}

function showResult(entry) {
  const meta = entry.meta || {};
  $("resultTitle").textContent = meta.title || "Summary";
  $("resultMeta").textContent = meta.channel || "";
  $("summary").innerHTML = sanitizeHtml(entry.summary || "");
  showState("state-result");
}

function showReadyWithError(msg) {
  showState("state-ready");
  $("summary").innerHTML = "";
  $("go").disabled = false;
  setStatus(msg, true);
}

// ---------- Setup UI ----------
function selectSetupProvider(p) {
  setupProvider = p;
  document.querySelectorAll(".provider-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.provider === p);
  });
  $("setupKeyLabel").textContent = PROVIDER_KEY_LABEL[p];
  $("setupKey").placeholder = PROVIDER_KEY_PLACEHOLDER[p];
  $("setupKey").value = "";
  const link = $("setupKeyLink");
  link.href = PROVIDER_KEY_LINK[p].href;
  link.textContent = PROVIDER_KEY_LINK[p].text;
}

function updateProviderChip(provider) {
  $("providerName").textContent = PROVIDER_LABEL[provider] || "Claude";
}

// ---------- Boot ----------
(async () => {
  const cfg = await chrome.storage.local.get([
    "preferredProvider", "anthropicKey", "openaiKey",
  ]);
  const hasAnyKey = !!(cfg.anthropicKey || cfg.openaiKey);
  const provider = cfg.preferredProvider || "anthropic";

  // Wire up setup provider cards regardless of state.
  document.querySelectorAll(".provider-card").forEach((card) => {
    card.addEventListener("click", () => selectSetupProvider(card.dataset.provider));
  });
  selectSetupProvider(provider);

  if (!hasAnyKey) {
    showState("state-setup");
    return;
  }

  updateProviderChip(provider);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  if (!isYouTubeWatch(tab?.url)) {
    $("not-yt").classList.remove("hidden");
    $("go").disabled = true;
    showState("state-ready");
    return;
  }

  const key = `summary:${tab.id}`;
  const data = await chrome.storage.local.get(key);
  const entry = data[key];
  if (!entry) {
    showState("state-ready");
    return;
  }

  if (entry.meta?.url && entry.meta.url !== tab.url) {
    chrome.storage.local.remove(key);
    showState("state-ready");
    return;
  }

  if (entry.status === "loading") {
    showLoading(entry.phase || "Summarizing…");
    startPolling();
  } else if (entry.status === "ok") {
    showResult(entry);
  } else if (entry.status === "error") {
    showReadyWithError(entry.error || "Something went wrong.");
  } else {
    showState("state-ready");
  }
})();

// ---------- Setup save ----------
$("setupSave").addEventListener("click", async () => {
  const keyInput = $("setupKey").value.trim();
  const statusEl = $("setupStatus");
  if (!keyInput) {
    statusEl.textContent = "Paste a key to continue.";
    statusEl.className = "status error";
    return;
  }
  await chrome.storage.local.set({
    [PROVIDER_KEY_FIELD[setupProvider]]: keyInput,
    preferredProvider: setupProvider,
  });
  updateProviderChip(setupProvider);
  statusEl.textContent = "";
  setStatus("");
  $("go").disabled = false;

  // Re-check current tab now that setup is done.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  if (!isYouTubeWatch(tab?.url)) {
    $("not-yt").classList.remove("hidden");
    $("go").disabled = true;
  } else {
    $("not-yt").classList.add("hidden");
  }
  showState("state-ready");
});

// ---------- Event handlers ----------
$("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$("backBtn").addEventListener("click", async () => {
  if (currentTab?.id) {
    await chrome.storage.local.remove(`summary:${currentTab.id}`);
  }
  setStatus("");
  $("go").disabled = false;
  showState("state-ready");
});

$("openVideoBtn").addEventListener("click", async () => {
  if (!currentTab?.id) return;
  const key = `summary:${currentTab.id}`;
  const data = await chrome.storage.local.get(key);
  const url = data[key]?.meta?.url;
  if (!url) return;
  try {
    await chrome.tabs.update(currentTab.id, { active: true, url });
    window.close();
  } catch {
    await chrome.tabs.create({ url, active: true });
  }
});

$("go").addEventListener("click", async () => {
  const cfg = await chrome.storage.local.get(["preferredProvider"]);
  const provider = cfg.preferredProvider || "anthropic";
  const btn = $("go");
  btn.disabled = true;
  setStatus("Reading transcript…");
  try {
    if (!isYouTubeWatch(currentTab?.url)) {
      throw new Error("Open a YouTube video first.");
    }
    const tx = await chrome.tabs.sendMessage(currentTab.id, { type: "GET_TRANSCRIPT" });
    console.log("[no-time] transcript response", tx);
    if (!tx?.ok) throw new Error(tx?.error || "Could not get transcript.");

    const key = `summary:${currentTab.id}`;
    await chrome.storage.local.set({
      [key]: { status: "loading", meta: tx.meta, provider },
    });
    showLoading("Summarizing…");

    chrome.runtime.sendMessage({
      type: "START_SUMMARY",
      provider,
      meta: tx.meta,
      transcript: tx.transcript,
      resultTabId: currentTab.id,
    });

    startPolling();
  } catch (e) {
    console.error("[no-time] popup error", e);
    showReadyWithError(e.message || String(e));
  }
});

function startPolling() {
  if (!currentTab?.id) return;
  if (pollTimer) clearInterval(pollTimer);
  const key = `summary:${currentTab.id}`;
  pollTimer = setInterval(async () => {
    const data = await chrome.storage.local.get(key);
    const entry = data[key];
    if (!entry) {
      clearInterval(pollTimer);
      pollTimer = null;
      return;
    }
    if (entry.status === "ok") {
      clearInterval(pollTimer);
      pollTimer = null;
      showResult(entry);
    } else if (entry.status === "error") {
      clearInterval(pollTimer);
      pollTimer = null;
      showReadyWithError(entry.error || "Something went wrong.");
    }
  }, 400);
}
