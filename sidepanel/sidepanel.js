const btnHint    = document.getElementById('btn-hint');
const btnAuto    = document.getElementById('btn-auto');
const btnClearHl = document.getElementById('btn-clear-hl');
const btnClear   = document.getElementById('btn-clear');
const btnCheck   = document.getElementById('btn-check');
const btnReload  = document.getElementById('btn-reload');
const engineSelect = document.getElementById('engine-select');
const timeSelect = document.getElementById('time-select');
const logEl      = document.getElementById('log');
const logCount   = document.getElementById('log-count');
const statusDot  = document.getElementById('status-dot');
const colorLabel = document.getElementById('color-label');
const banner     = document.getElementById('banner');

let count  = 0;
let autoOn = false;
let port   = null;

// ─── Port ─────────────────────────────────────────────────────────────────────

function connect() {
  port = chrome.runtime.connect({ name: 'sidepanel' });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'TAB_STATUS':
        setChessComActive(msg.onChessCom);
        break;

      case 'LOG':
        appendLog(msg.level || 'info', msg.text);
        if (msg.level === 'error') setStatus('error');
        if (msg.text?.startsWith('Thinking')) setStatus('thinking');
        break;

      case 'COLOR_DETECTED':
        applyColor(msg.color);
        break;

      case 'RESULT':
        setStatus('ok');
        break;

      case 'GAME_OVER':
        setStatus('idle');
        appendLog('info', '⚑ Game over: ' + msg.text);
        if (autoOn) toggleAuto(false);
        break;
    }
  });

  port.onDisconnect.addListener(() => { port = null; setTimeout(connect, 500); });
}

connect();

function send(msg) {
  if (!port) return;
  try {
    port.postMessage(msg);
  } catch {
    port = null;
    setTimeout(connect, 500);
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

chrome.storage.local.get(['thinkingTime', 'engine'], (data) => {
  if (data.thinkingTime) timeSelect.value = String(data.thinkingTime);

  const engine = data.engine || 'betafish';
  engineSelect.value = engine;
  send({ type: 'SET_ENGINE', engine });
});

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function applyColor(color) {
  const isWhite = color === 0;
  colorLabel.textContent = isWhite ? '♙ White' : '♟ Black';
  colorLabel.className   = 'color-label ' + (isWhite ? 'white' : 'black');
}

function setChessComActive(onChessCom) {
  banner.classList.toggle('hidden', onChessCom);
  btnHint.disabled = !onChessCom;
  btnAuto.disabled = !onChessCom;
  if (!onChessCom && autoOn) toggleAuto(false);
}

function setStatus(state) {
  statusDot.className = 'dot ' + state;
  statusDot.title     = state.charAt(0).toUpperCase() + state.slice(1);
}

function appendLog(level, text) {
  const time = new Date().toTimeString().slice(0, 8);

  const line = document.createElement('div');
  line.className = 'log-line ' + (level || 'info');

  const ts = document.createElement('span');
  ts.className   = 'log-time';
  ts.textContent = time;

  const msg = document.createElement('span');
  msg.className   = 'log-text';
  msg.textContent = text;

  line.appendChild(ts);
  line.appendChild(msg);
  logEl.appendChild(line);

  logCount.textContent = ++count;
  logEl.scrollTop = logEl.scrollHeight;
}

function toggleAuto(on) {
  autoOn = on;
  btnAuto.dataset.active = String(autoOn);
  btnAuto.textContent    = autoOn ? '⟳ Auto ON' : '⟳ Auto';
  send({ type: 'SET_AUTO', enabled: autoOn });
  setStatus(autoOn ? 'thinking' : 'idle');
}

// ─── Button Handlers ──────────────────────────────────────────────────────────

btnHint.addEventListener('click', () => {
  setStatus('thinking');
  btnHint.disabled = true;
  send({ type: 'GET_HINT' });
  setTimeout(() => { btnHint.disabled = false; }, 500);
});

btnAuto.addEventListener('click', () => toggleAuto(!autoOn));

btnClearHl.addEventListener('click', () => send({ type: 'CLEAR_HIGHLIGHT' }));

btnClear.addEventListener('click', () => {
  logEl.innerHTML      = '';
  count                = 0;
  logCount.textContent = '0';
  setStatus('idle');
});

btnCheck.addEventListener('click', () => send({ type: 'CHECK' }));

btnReload.addEventListener('click', () => {
  appendLog('info', 'Reloading extension…');
  setTimeout(() => chrome.runtime.reload(), 300);
});

engineSelect.addEventListener('change', () => {
  const engine = engineSelect.value;
  chrome.storage.local.set({ engine });
  send({ type: 'SET_ENGINE', engine });
});

timeSelect.addEventListener('change', () => {
  const seconds = parseInt(timeSelect.value);
  chrome.storage.local.set({ thinkingTime: seconds });
  send({ type: 'SET_TIME', seconds });
});
