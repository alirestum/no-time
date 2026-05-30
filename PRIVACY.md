# Privacy Policy — No Time

_Last updated: 2026-05-30_

No Time is a Chrome extension that summarizes YouTube videos by sending their transcripts to an AI provider of your choice (Anthropic or OpenAI). This document explains exactly what data the extension handles, where it goes, and what it does not do.

## What the extension stores

Stored **locally on your computer**, in `chrome.storage.local`:

- The API keys you paste into the setup or settings screen.
- Your preferred provider (Anthropic or OpenAI).
- Optional model overrides.
- A short-lived cache of the most recent summary per browser tab, cleared automatically when that tab closes or when you start a new summary.

Nothing in `chrome.storage.local` is transmitted to the developer or any third party except the provider call described below.

## What gets transmitted, and to whom

When you click **Summarize**:

1. The extension reads the active YouTube tab's transcript (either by opening YouTube's built-in transcript panel or by fetching its caption track).
2. The transcript, the video title, the channel name, and the video URL are sent **directly from your browser** to the API of the provider you selected:
   - **Anthropic** (`https://api.anthropic.com/v1/messages`), authenticated with your Anthropic API key, **or**
   - **OpenAI** (`https://api.openai.com/v1/chat/completions`), authenticated with your OpenAI API key.
3. The provider returns a summary, which is displayed in the extension popup.

The request flows from your browser straight to the provider. It does **not** pass through any server controlled by the developer of this extension.

The data you send is subject to the privacy policy of the provider you chose:

- Anthropic: <https://www.anthropic.com/legal/privacy>
- OpenAI: <https://openai.com/policies/privacy-policy>

## What the extension does NOT do

- It does not run analytics, telemetry, or crash reporting.
- It does not contact any server operated by the developer.
- It does not read or transmit any page content outside of the active YouTube watch page when you explicitly click Summarize.
- It does not sell, share, or transfer your data to anyone.
- It does not use your data for training, profiling, or advertising.

## Permissions used

- `storage` — to save your API key and preferences locally on this device.
- `activeTab` — to read the transcript of the YouTube tab you have open when you press Summarize.
- Host access to `www.youtube.com` — to extract the transcript.
- Host access to `api.anthropic.com` and `api.openai.com` — to call the AI provider you selected.

## Removing your data

Uninstalling the extension removes everything it has stored locally. There is no remote account to delete.

## Contact

For privacy questions, open an issue at the project's GitHub repository.
