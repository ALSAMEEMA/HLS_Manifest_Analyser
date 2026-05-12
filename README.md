# 📺 HLS Manifest Viewer

A browser-based HLS manifest (.m3u8) analyzer — inspect variants, audio tracks, subtitles, segments, codecs, encryption, and more with a modern visual UI. Zero dependencies, no build step.

**[Live Demo →](https://alsameema.github.io/HLS_Manifest_Analyser/)** 

## Features

### Manifest Analysis
- **Master Playlist** — variants, resolutions, codecs, bandwidth range
- **Media Playlist** — segments, duration stats, media sequence, encryption
- **Audio-Only Variants** — `#EXT-X-STREAM-INF` without resolution detected separately
- **I-Frame Playlists** — `#EXT-X-I-FRAME-STREAM-INF` trick play streams
- **Audio Tracks** — `#EXT-X-MEDIA TYPE=AUDIO` with channels, language, group
- **Subtitles & Closed Captions** — inband (CEA-608/708) and sidecar (WebVTT) detection

### HLS Tags Parsed
| Tag | Details |
|-----|---------|
| `#EXT-X-STREAM-INF` | Bandwidth, resolution, codecs, frame rate, audio group |
| `#EXT-X-MEDIA` | Type, name, language, group, channels, default, forced |
| `#EXT-X-I-FRAME-STREAM-INF` | I-frame variants with HDCP level |
| `#EXT-X-KEY` | Encryption method and key URI |
| `#EXT-X-MAP` | Init segment (fMP4/CMAF) |
| `#EXT-X-PROGRAM-DATE-TIME` | Live/DVR timeline |
| `#EXT-X-BYTERANGE` | Byte-range segment addressing |
| `#EXT-X-START` | Preferred start offset |
| `#EXT-X-INDEPENDENT-SEGMENTS` | Independent decode capability |
| `#EXT-X-DISCONTINUITY` | Stream discontinuity markers |
| `#EXT-X-SESSION-KEY` | Session-level DRM keys |
| `#EXTINF` | Segment durations |

### Low-Latency HLS (LL-HLS)
| Tag | Details |
|-----|---------|
| `#EXT-X-SERVER-CONTROL` | CAN-BLOCK-RELOAD, CAN-SKIP-UNTIL, HOLD-BACK, PART-HOLD-BACK |
| `#EXT-X-PART-INF` | PART-TARGET duration |
| `#EXT-X-PART` | Partial segments with duration, URI, INDEPENDENT, GAP |
| `#EXT-X-PRELOAD-HINT` | Preload hint type and URI |
| `#EXT-X-SKIP` | Delta updates — skipped segments count |

### DRM / PSSH Decoding
- **Widevine** — PSSH box decoding with provider, content ID, key IDs
- **PlayReady** — PRO header XML, license URL, key IDs, algorithm
- **FairPlay, ClearKey** — system ID detection from KEYFORMAT
- Base64 PSSH from key URI → decoded table with copy buttons
- Session keys (`#EXT-X-SESSION-KEY`) support

### Codec Decoding
Raw codec strings are decoded to human-readable names:
- `avc1.640028` → H.264 High L4
- `mp4a.40.2` → AAC-LC
- `hvc1.2.4.L120` → H.265 Main 10
- `ec-3` → Dolby EC-3 (E-AC-3)
- And more (AV1, VP9, Opus, FLAC, Dolby Vision, etc.)

### Visualization
- **Segment Duration Chart** — canvas bar chart with target duration reference line
- **Collapsible Sections** — compact tables with expand/collapse for large manifests
- **Jump Navigation** — quick-jump buttons to sections
- **Validation Warnings** — missing `#EXTM3U`, segments exceeding target duration, etc.

### UX
- 🌙 Dark / ☀️ Light theme with glassmorphism design
- 📁 Drag-and-drop file upload
- 🔗 Load manifest from URL with CORS support
- 📋 Copy full segment URLs from media playlists
- 💾 Export analysis as JSON
- 🔄 Auto-refresh for live manifests (uses target duration interval)
- Live badge with refresh counter and timestamp
- Section expand/collapse states preserved during refresh
- 🕑 URL history with localStorage persistence
- 📱 Responsive design

## Usage

### Option 1: Open directly
Open `index.html` in any modern browser.

> **Note:** Loading manifests from URL requires serving via HTTP due to browser CORS restrictions.
> Use a local server: `python -m http.server 8080` or VS Code Live Server.

### Option 2: GitHub Pages
Push to GitHub and enable Pages in Settings → the site works as-is with no build step.

### How to analyze
1. **Paste a URL** and click **Load URL**, or
2. **Drag & drop** a `.m3u8` file, or
3. **Paste** manifest content directly into the textarea

Then click **Analyze Manifest**.

## Tech Stack

- **HTML5 / CSS3 / Vanilla JS** — zero dependencies, no build step
- **CSS Variables** — full dark/light theming
- **Canvas API** — segment duration chart
- **Google Fonts** — Inter + JetBrains Mono

## File Structure

```
├── index.html    # Main page
├── script.js     # Parser, renderers, event handling
├── style.css     # All styles with dark/light themes
└── README.md
```

## License

MIT
