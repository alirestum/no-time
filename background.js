// Service worker: handles LLM API calls so popup/summary pages don't have to.

const SYSTEM_PROMPT = `You summarize YouTube videos for people who don't have time.
The transcript may be long-winded, full of filler, anecdotes, sponsor reads, and tangents.
Your job: extract only what matters.

Output strictly as HTML. Use only these tags: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <blockquote>, <br>, <hr>. No <script>, no <style>, no inline styles, no class attributes, no markdown syntax (no **, no #, no -). Do not wrap the response in <html>, <body>, or code fences.

Structure:
<h2>TL;DR</h2>
<p>One or two sentences — the single most useful takeaway.</p>
<h2>Key points</h2>
<ul>
  <li>3 to 7 concrete insights. Short. No filler. No "the speaker says".</li>
</ul>

Be blunt. Skip throat-clearing. Use <strong> for the most important phrase in each bullet if useful. If the video genuinely says nothing of substance, say so plainly.`;

function buildUserPrompt({ title, channel, url, transcript }) {
  return `Video: ${title}
Channel: ${channel}
URL: ${url}

Transcript:
${transcript}`;
}

async function callOpenAI({ apiKey, model, body }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(body) },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

async function callAnthropic({ apiKey, model, body }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(body) }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t}`);
  }
  const json = await res.json();
  return (json.content || []).map((c) => c.text || "").join("\n");
}

async function runSummarize({ provider, meta, transcript, resultTabId }) {
  const key = `summary:${resultTabId}`;
  try {
    const cfg = await chrome.storage.local.get([
      "openaiKey", "anthropicKey", "openaiModel", "anthropicModel",
    ]);
    let summary;
    if (provider === "openai") {
      if (!cfg.openaiKey) throw new Error("No OpenAI API key set. Open the extension options.");
      summary = await callOpenAI({
        apiKey: cfg.openaiKey,
        model: cfg.openaiModel || "gpt-4o-mini",
        body: { ...meta, transcript },
      });
    } else {
      if (!cfg.anthropicKey) throw new Error("No Anthropic API key set. Open the extension options.");
      summary = await callAnthropic({
        apiKey: cfg.anthropicKey,
        model: cfg.anthropicModel || "claude-haiku-4-5",
        body: { ...meta, transcript },
      });
    }
    await chrome.storage.local.set({ [key]: { status: "ok", summary, meta, provider } });
  } catch (e) {
    await chrome.storage.local.set({
      [key]: { status: "error", error: e?.message || String(e), meta, provider },
    });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "START_SUMMARY") {
    runSummarize(msg);
  }
});

// Clean up storage entries for tabs that no longer exist.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`summary:${tabId}`).catch(() => {});
});
