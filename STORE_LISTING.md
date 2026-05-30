# Chrome Web Store listing — No Time

Copy-paste source for the developer dashboard form.

---

## Name

`No Time`

## Summary / short description (max 132 chars)

`Summarize YouTube videos using their built-in transcripts. Skip the filler — get the point in seconds.`

## Detailed description

```
No Time turns long YouTube videos into a few sentences you can actually read.

It uses YouTube's own transcripts as the source, then sends them to the AI provider of your choice — Anthropic Claude or OpenAI — for summarization. You bring your own API key. The extension never routes your data through any server we control.

WHAT YOU GET FOR EVERY VIDEO
• TL;DR — one or two sentences with the actual takeaway
• Key points — 3 to 7 short, concrete insights, no filler
• "Worth watching?" — a one-line verdict

HOW IT WORKS
1. Open a YouTube video.
2. Click the No Time icon.
3. Hit Summarize. The summary appears in the popup in a few seconds.

PRIVACY-FIRST
• Your API key stays in chrome.storage.local on your own machine.
• Transcripts are sent directly from your browser to your chosen provider — never through a third-party server.
• No analytics. No telemetry. No tracking.

REQUIREMENTS
• An Anthropic or OpenAI API key (paste it into the setup screen when you first open the extension).

CUSTOMIZATION
• Switch provider any time from Settings.
• Override the model (defaults: claude-haiku-4-5 and gpt-4o-mini).

For videos that talk too much.
```

## Category

`Productivity`

## Language

`English`

---

## Per-permission justification (Web Store form)

| Permission | Justification |
|---|---|
| `storage` | Save the user's API key, preferred provider, and model overrides locally so they persist between sessions. Also temporarily caches the last summary per tab. |
| `activeTab` | Read the YouTube transcript from the tab the user is currently on, only when they explicitly click Summarize. |
| Host: `https://www.youtube.com/*` | Run a content script on YouTube watch pages to open and extract the transcript from YouTube's own transcript panel and caption tracks. |
| Host: `https://api.openai.com/*` | Send the transcript to OpenAI's chat completions endpoint when the user has selected OpenAI as their provider. Uses the user's own API key. |
| Host: `https://api.anthropic.com/*` | Send the transcript to Anthropic's messages endpoint when the user has selected Anthropic as their provider. Uses the user's own API key. |

## Remote code use

`No` — all extension code is bundled in the package. The extension makes API calls to Anthropic and OpenAI, but does not load or execute remote scripts.

## Data usage disclosure (Web Store privacy form)

Disclose the following:

- **Personally identifiable information**: Not collected.
- **Authentication information**: User-provided API keys, stored locally only.
- **User activity**: Transcripts of YouTube videos the user explicitly chooses to summarize, transmitted directly to the user's chosen AI provider.
- **Website content**: YouTube transcripts of pages the user chooses to summarize.

Confirm:
- Not sold or transferred to third parties for purposes unrelated to the single purpose.
- Not used or transferred for purposes unrelated to the extension's single purpose.
- Not used or transferred to determine creditworthiness or for lending purposes.

## Single purpose

`Summarize the currently-open YouTube video using its transcript and a user-supplied AI API key.`

## Privacy policy URL

Once the repo is on GitHub at `https://github.com/<USERNAME>/no-time`:

- **Quick option**: link directly to `https://github.com/<USERNAME>/no-time/blob/main/PRIVACY.md` (Web Store accepts this).
- **Cleaner option**: enable GitHub Pages on the repo (Settings → Pages → Source: `main` branch, `/` root). The policy will then also be available at `https://<USERNAME>.github.io/no-time/PRIVACY.md`.

## Assets needed for upload

- Icon 128×128: `icons/icon-128.png` ✓
- Small promo tile 440×280: `icons/promo-tile.png` ✓
- Screenshots 1280×800 (1–5): take these yourself once installed. Suggested set:
  1. Setup screen.
  2. Ready state on a YouTube video.
  3. Loading blob state.
  4. Result state with a summary.
  5. Settings page.
- Marquee promo tile 1400×560: optional, only required if Google features your extension.
