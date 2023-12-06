# Chess Hint Extension — Task List

## 1. Project Setup
- [x] Create folder structure (`icons/`, `worker/`, `content/`, `sidepanel/`)
- [x] Use existing files at root: `jquery.js`, `betafish.js`, `chess.js`

## 2. Assets
- [x] Generate icon 16×16 px (`icons/icon16.png`)
- [x] Generate icon 32×32 px (`icons/icon32.png`)
- [x] Generate icon 48×48 px (`icons/icon48.png`)
- [x] Generate icon 128×128 px (`icons/icon128.png`)

## 3. Manifest
- [x] Create `manifest.json` (MV3)
  - name, version, description
  - `sidePanel`, `scripting`, `storage`, `tabs` permissions
  - `host_permissions: ["https://www.chess.com/*"]`
  - `background.service_worker: "background.js"`
  - `content_scripts`: jquery.js + content/content.js on chess.com
  - `side_panel.default_path: "sidepanel/sidepanel.html"`
  - `web_accessible_resources`: worker/engine.worker.js, betafish.js, chess.js

## 4. Web Worker — `worker/engine.worker.js`
- [x] `importScripts('../betafish.js')` — classic script, no exports
- [x] `import('../chess.js')` — dynamic import for ES module
- [x] Handle `{ type: "COMPUTE", pgn, time }` → PGN→FEN→engine→best move
- [x] Handle `{ type: "SET_TIME", seconds }`
- [x] Post back `RESULT`, `GAME_OVER`, `ERROR`, `LOG` messages

## 5. Content Script — `content/content.js`
- [x] `getCurrentPGN()` — scrape `#live-game-tab-scroll-container`
- [x] `autoDetectColor()` — detect White/Black from `#board-single.flipped`
- [x] `highlightBestMove(from, to)` — CSS class + arrow overlay
- [x] `drawArrow()` — absolute-positioned div between squares
- [x] `resetHighlight()` — remove all overlays
- [x] Spawn `engine.worker.js` via `chrome.runtime.getURL`, keep alive
- [x] Listen for messages from background:
  - `GET_HINT` → `getHint()`
  - `SET_AUTO(bool)` → start/stop `setInterval(safeAutoHint, 500)`
  - `SET_COLOR(color)` → override `myColor`
  - `SET_TIME(seconds)` → forward to worker
- [x] Post LOG messages back via `chrome.runtime.sendMessage`

## 6. Highlight CSS — `content/highlight.css`
- [x] `.chess-hint-from` — yellow overlay for source square
- [x] `.chess-hint-to` — green overlay for target square
- [x] `.chess-hint-arrow` — green gradient arrow between squares
- [x] Fade-in animation

## 7. Background Service Worker — `background.js`
- [x] `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- [x] Accept long-lived port from sidePanel (`name: 'sidepanel'`)
- [x] Forward commands from sidePanel → active tab content script
- [x] Forward LOG/RESULT/GAME_OVER from content → sidePanel port

## 8. Side Panel — `sidepanel/sidepanel.html`
- [x] Header: icon + title + status dot
- [x] Color selector: Auto / White / Black radio group
- [x] Thinking time `<select>` (1s, 2s, 4s, 6s, 10s)
- [x] `[▶ Hint]` button — manual hint
- [x] `[⟳ Auto]` toggle button — auto hint on/off
- [x] `[✕ Clear]` button — clear log
- [x] Scrollable log area

## 9. Side Panel JS — `sidepanel/sidepanel.js`
- [x] Restore settings from `chrome.storage.local` on load
- [x] `[Hint]` click → `port.postMessage({ type: 'GET_HINT' })`
- [x] `[Auto]` toggle → `SET_AUTO`, update button style
- [x] Color change → `SET_COLOR` + save to storage
- [x] Time change → `SET_TIME` + save to storage
- [x] `[Clear]` → clear log DOM + reset count
- [x] Listen for port messages → append timestamped log lines
- [x] Auto-scroll log to bottom
- [x] Status dot: idle / thinking / ok / error

## 10. Side Panel CSS — `sidepanel/sidepanel.css`
- [x] Dark theme (`#1a1e26` background)
- [x] Active/inactive state for Auto toggle button
- [x] Monospace log with per-level color coding (move=green, error=red)
- [x] Animated status dot (pulse when thinking)

## 11. Testing
- [ ] Load unpacked extension in Chrome (`chrome://extensions` → Load unpacked → `d:\Games\chess-bot`)
- [ ] Verify sidePanel opens on chess.com when toolbar icon clicked
- [ ] Test manual hint — correct move highlighted
- [ ] Test auto hint — triggers on opponent move
- [ ] Test color auto-detect (play as Black)
- [ ] Test thinking time change takes effect
- [ ] Test log output appears in sidePanel
- [ ] Test highlight clears on new hint
- [ ] Verify engine runs in worker (page stays responsive during search)
- [ ] Check for console errors

## 12. Polish
- [x] Handle chess.com tab not active — yellow banner + disabled buttons in sidepanel
- [x] Handle game not started — guard in `getHint()`, send "No game detected" log
- [x] Handle checkmate/draw — auto-stop auto mode, log result with ⚑
- [x] Version bump → 1.1.0

## 13. Package
- [ ] Zip extension folder
- [ ] Test install from zip (not dev mode)
