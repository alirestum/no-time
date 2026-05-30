# No Time — Handoff

_Snapshot: 2026-05-30_

## TL;DR

`v1.0.0` of the extension is built, packaged, and committed to a local git repo. `no-time-v1.0.0.zip` is the file to upload to the Chrome Web Store. There is **no GitHub remote yet** and the extension has **not been submitted** to the store.

## What exists

```
no-time/
├── manifest.json          # MV3, v1.0.0, permissions: storage + activeTab
├── background.js          # Service worker — calls Anthropic / OpenAI APIs
├── content.js             # YouTube transcript extractor (panel + caption fallback)
├── popup.html / popup.js  # Setup / Ready / Loading / Result states, claymorphism
├── options.html / options.js  # Settings page with custom clay dropdown
├── icons/
│   ├── logo.svg               # Source of truth, uses real Nunito Black "N" glyph path
│   ├── icon-{16,32,48,128}.png  # Toolbar / extension list icons
│   ├── promo-tile.svg         # Source for store promo
│   └── promo-tile.png         # 440×280 store promo tile
├── PRIVACY.md             # Privacy policy ready to host
├── README.md              # Public-facing repo overview
├── STORE_LISTING.md       # All copy + per-permission justifications for the store form
├── HANDOFF.md             # This file
├── .gitignore             # Excludes .DS_Store, *.zip, node_modules/
└── no-time-v1.0.0.zip     # Store upload, 32KB, gitignored
```

Git state: one commit on `main` (or `master`, depending on local default). No remote.

## Architecture at runtime

1. User opens a YouTube video, clicks the extension icon → `popup.html` opens.
2. On first run (no API keys in storage): popup shows the **setup state**, user picks Claude or OpenAI and pastes a key. Saved to `chrome.storage.local`.
3. Subsequent opens: popup shows the **ready state** with a provider chip and a big Summarize button.
4. Click Summarize:
   - Popup sends `GET_TRANSCRIPT` to the YouTube tab's content script.
   - `content.js` opens YouTube's transcript panel (clicks the inner button via a real mouse-event sequence, with fallback to opening "..." menu) and scrapes `ytd-transcript-segment-renderer` elements. If that fails, it falls back to fetching the caption tracks (`captionTracks` array extracted from inline scripts, tries `json3` → `srv3` → `srv1` → no-format).
   - Popup writes `{ status: "loading", meta, provider }` to `chrome.storage.local` under key `summary:<tabId>`, transitions to **loading state**, and sends `START_SUMMARY` to the background.
   - Background reads the API key from storage, calls Anthropic or OpenAI directly from the service worker (CORS-free), and writes the result back to `summary:<tabId>` with `{ status: "ok", summary, ... }` or `{ status: "error", error, ... }`.
   - Popup polls that storage key every 400ms and renders the result.
5. Result is HTML (the model is prompted to return safe HTML — `h2/h3/p/ul/ol/li/strong/em/code/blockquote/br/hr` only). `popup.js` walks the parsed DOM and strips any tag/attribute outside the allowlist before injecting.
6. Closing and reopening the popup restores the loading or result state if the storage entry is still there for the current tab.

## Design system

- **Style**: Claymorphism (from UI/UX Pro Max recommendation).
- **Palette**: Primary `#E11D48` (rose), accent `#2563EB` (blue), background gradient `#FFE4E6 → #FFF1F2 → #FCE7F3`, ink `#2A0E1A`, soft fg `#9F1239`.
- **Fonts**: Nunito (700/800/900) for headings, DM Sans (400/500/700) for body. Loaded from Google Fonts.
- **Shape**: Three radius tiers — 30px (cards), 20px (controls), 14px (chips).
- **Shadow**: Layered outset + soft inset highlight + faint inset darker rim. Inputs use a deeper inset to read as "pushed in". Pressed states swap outset for inset for tactile feel.
- **Motion**: 150–300ms eases; springy `cubic-bezier(.34, 1.56, .64, 1)` on press; 1.6s loop on the loading blob; everything respects `prefers-reduced-motion`.

## Known issues / things to watch

- **Captions sometimes return empty bodies**. Recent YouTube changes have started requiring a player session token for some caption URLs. If a video has only auto-generated captions and the URL returns 200 + 0 bytes for every format, summarization will fail. Today the panel-scrape path is the primary; the caption fallback is a backup. Mitigation if this becomes common: figure out how to inject the page-context `ytcfg` to get a `pot` token, or just tell the user to enable captions manually first.
- **Long transcripts**. No truncation is in place. A 3-hour podcast may exceed the model's context window. Easy fix in `background.js`: cap `transcript` to ~30k chars before sending.
- **Popup width is 460px, max height 580px**. Chrome caps action-popup size at 800×600. Long summaries scroll inside the result card. If you ever want a bigger view, the only way is `chrome.windows.create` (which we removed earlier).
- **No tests**. Everything was verified by hand. Reasonable next step is a few Playwright smoke tests against a real YouTube page.

## Immediate next steps (publishing)

1. **Create the GitHub repo and push.** Name it `no-time`. After pushing:
   - The privacy policy is reachable at `https://github.com/<USERNAME>/no-time/blob/main/PRIVACY.md`.
   - Optional: enable GitHub Pages (Settings → Pages → branch `main`, root `/`) for cleaner URLs.
2. **Sign up for the Chrome Web Store developer account.** $5 one-time at `chrome.google.com/webstore/devconsole`. Identity verification can take a day or two.
3. **Take screenshots.** 1280×800, 1–5 images. Suggested set: setup screen, ready state on a YouTube video, loading blob, result with rendered summary, settings page. Use macOS screenshot + crop.
4. **Submit the listing.** Upload `no-time-v1.0.0.zip`, paste everything from `STORE_LISTING.md` into the matching form fields, attach `icons/promo-tile.png` and the screenshots, paste the privacy policy URL. Review usually takes 3–7 days for a first submission.

## Future improvements (no rush)

- **Transcript truncation** before sending to the model (see above).
- **Streaming output** — both providers support SSE. Would feel much snappier than a 10-second blob animation. Means changing the background to stream to storage and have the popup render incrementally.
- **History view** — currently the result for a tab is wiped when the tab closes. Could keep a list of recent summaries keyed by video ID.
- **Auto-summarize toggle** — option to summarize as soon as the popup opens on a YouTube page.
- **Custom prompt** — let power users override the system prompt in settings.
- **Other languages** — system prompt currently encourages English output. Could detect transcript language and pass through.
- **Token cost display** — show approximate cost per summary in the result footer.
- **Firefox build** — manifest is mostly portable; the main delta is service-worker vs. background scripts. Could ship a `manifest-firefox.json` and a simple build step.

## How to rebuild the zip

```bash
zip -r no-time-vX.Y.Z.zip \
  manifest.json background.js content.js \
  popup.html popup.js options.html options.js \
  icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-128.png \
  -x "*.DS_Store"
```

Bump the `version` in `manifest.json` first, and remember store-version numbers must monotonically increase per submission.

## How to regenerate icons / promo tile

The PNGs are rasterized from SVG with `sharp` + `opentype.js` (for pulling real Nunito glyph paths from the variable TTF at `wght: 900`). The conversion scripts were ephemeral — they lived in `/tmp/notime-conv` and were deleted at the end of the session. To redo:

1. `mkdir -p /tmp/notime-conv && cd /tmp/notime-conv && npm init -y && npm install sharp opentype.js`
2. `curl -L -o Nunito.ttf https://github.com/google/fonts/raw/main/ofl/nunito/Nunito%5Bwght%5D.ttf`
3. Re-run the conversion script (the source lives in the git history of this session's bash commands; reconstruct from `icons/logo.svg` and `icons/promo-tile.svg`).

If you change the logo, update both `icons/logo.svg` AND the inline copies in `popup.html` and `options.html` — they should stay in sync.
