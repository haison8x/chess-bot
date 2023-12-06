# Chess Hint – Chrome Extension

Chess.com assistant. Runs Betafish engine locally in a Web Worker, overlays best-move hints on the board, no server required.

---

## Features

| Feature | Detail |
|---|---|
| Side panel UI | All controls in Chrome's native sidePanel — no popup, no injected buttons |
| Auto hint | Watches board every 500 ms; hints automatically when it's your turn |
| Manual hint | One-click hint on demand |
| Color detection | Auto-detects whether you play White or Black via clock CSS classes |
| Thinking time | Select engine think time 1–9 s (default 3 s, persisted in storage) |
| Log panel | Engine output and move history shown in sidePanel, not browser console |
| Non-blocking | Engine runs in a Blob Web Worker — UI and board never freeze |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Chrome Extension                                        │
│                                                          │
│  ┌──────────────┐  long-lived port  ┌─────────────────┐  │
│  │  sidepanel/  │◄─────────────────►│  background.js  │  │
│  │  (UI, logs)  │                   │  (service worker│  │
│  └──────────────┘                   │   + msg router) │  │
│                                     └────────┬────────┘  │
│                                              │ sendMessage│
│                                     ┌────────▼────────┐  │
│                                     │  content.js     │  │
│                                     │  (chess.com tab)│  │
│                                     │  - reads PGN    │  │
│                                     │  - highlights   │  │
│                                     └────────┬────────┘  │
│                                              │ postMessage│
│                                     ┌────────▼────────┐  │
│                                     │  Blob Worker    │  │
│                                     │  (runtime-built)│  │
│                                     │  betafish.js    │  │
│                                     │  chess.js       │  │
│                                     └─────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Message flow — manual hint

```
SidePanel: [Hint] click
  → background: { type: "GET_HINT" }
    → content.js: reads PGN from DOM
      → Blob Worker: PGN → FEN → engine.getBestMove()
        → content.js: highlight from/to squares + draw arrow
          → background: { type: "LOG", move: "e2→e4" }
            → sidePanel: append log line
```

---

## File Structure

```
chess-hint/
├── manifest.json              # MV3 manifest — sidePanel, scripting, storage, tabs
├── background.js              # Service worker: message router, tab status, injection
├── betafish.js                # Chess engine (classic script, web_accessible_resource)
├── chess.js                   # Chess library — PGN/FEN (ES module, web_accessible_resource)
│
├── content/
│   ├── content.js             # Injected into chess.com — reads DOM, runs worker, highlights
│   └── highlight.css          # Square highlight + arrow overlay styles
│
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.js           # Button handlers, log rendering, port management
│   └── sidepanel.css          # Dark theme
│
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## Side Panel UI

```
┌──────────────────────────────┐
│  Playing as   ♙ White    ●   │  ← color-label + status dot
├──────────────────────────────┤
│  Thinking time  [3 s ▼]      │
├──────────────────────────────┤
│  [▶ Hint]  [⟳ Auto]         │
│  [⬜ Clear] [✕ Log]          │
├──────────────────────────────┤
│  [⚙ Check]  [↺ Reload ext]  │
├──────────────────────────────┤
│  Log                      0  │
│  ─────────────────────────   │
│  10:32:01  Thinking... (3s)  │
│  10:32:04  e2 → e4 (white)   │
└──────────────────────────────┘
```

Status dot: grey = idle, yellow (pulse) = thinking, green = ok, red = error.

---

## Key Technical Decisions

### Blob Worker (cross-origin workaround)
`new Worker(chrome-extension://...)` is blocked when called from a content script running on chess.com's origin. Workaround: build the worker code as a string, wrap in `new Blob(...)`, call `URL.createObjectURL()`, then `new Worker(blobUrl)`. Inside the blob worker, `importScripts(extensionUrl)` works because `betafish.js` and `chess.js` are listed in `web_accessible_resources`.

### PING + fire-and-forget messaging
`chrome.tabs.sendMessage` in MV3 requires the listener to call `sendResponse` or return a Promise — otherwise Chrome logs an error. Commands (`GET_HINT`, `SET_AUTO`, etc.) are fire-and-forget (no response needed). Only `PING` is awaitable (returns implicitly). `sendToTab` checks liveness with PING first, injects if dead, then sends the real message without awaiting a response.

### Auto color detection
Reads CSS class `clock-white` or `clock-black` on `#board-layout-player-bottom .clock-component`. Fallback: `wc-captured-pieces[player-color]` attribute. Detected on every hint so it stays current across games.

### Auto hint turn guard
`isMyTurn()` counts half-moves in the move list: even count → White to move, odd → Black. Only fires `getHint()` when `myColor === sideToMove` — prevents double-hinting on the opponent's turn.

### PGN reading
`getCurrentPgn()` scrapes `#live-game-tab-scroll-container .move-list-row`. Piece symbols use `data-figurine` attributes for figurine notation. This selector is the main fragility point — may break on chess.com DOM updates.

### Extension context invalidation
When the extension is reloaded while a chess.com tab is still open, `chrome.runtime.*` calls throw. `isContextValid()` catches this, sets `contextInvalid = true`, kills the auto-interval and worker, and suppresses further errors silently.

---

## Permissions

```json
"permissions": ["sidePanel", "scripting", "storage", "tabs"],
"host_permissions": ["https://www.chess.com/*"]
```

---

## Installation (dev)

1. Clone repo
2. Open `chrome://extensions`
3. Enable Developer mode
4. Load unpacked → select the repo folder
5. Navigate to chess.com → open a live game
6. Click the extension icon to open the side panel

---

## Limitations / Known Issues

- PGN scraper tied to chess.com DOM — may break after chess.com updates
- Only supports live games view (`#live-game-tab-scroll-container`)
- No opening book — engine calculates from move 1
- Engine strength limited by thinking time (1–9 s)
