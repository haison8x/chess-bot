if (window.__chessHintLoaded) {
  // already running; skip re-init
} else {
  window.__chessHintLoaded = true;

  const WHITE = 0;
  const BLACK = 1;

  const SQ120_TO_ALGEBRAIC = {
    21: 'A1', 22: 'B1', 23: 'C1', 24: 'D1', 25: 'E1', 26: 'F1', 27: 'G1', 28: 'H1',
    31: 'A2', 32: 'B2', 33: 'C2', 34: 'D2', 35: 'E2', 36: 'F2', 37: 'G2', 38: 'H2',
    41: 'A3', 42: 'B3', 43: 'C3', 44: 'D3', 45: 'E3', 46: 'F3', 47: 'G3', 48: 'H3',
    51: 'A4', 52: 'B4', 53: 'C4', 54: 'D4', 55: 'E4', 56: 'F4', 57: 'G4', 58: 'H4',
    61: 'A5', 62: 'B5', 63: 'C5', 64: 'D5', 65: 'E5', 66: 'F5', 67: 'G5', 68: 'H5',
    71: 'A6', 72: 'B6', 73: 'C6', 74: 'D6', 75: 'E6', 76: 'F6', 77: 'G6', 78: 'H6',
    81: 'A7', 82: 'B7', 83: 'C7', 84: 'D7', 85: 'E7', 86: 'F7', 87: 'G7', 88: 'H7',
    91: 'A8', 92: 'B8', 93: 'C8', 94: 'D8', 95: 'E8', 96: 'F8', 97: 'G8', 98: 'H8',
  };

  let worker        = null;
  let engineType    = 'betafish';
  let myColor       = WHITE;
  let thinkingTime  = 3;
  let autoInterval  = null;
  let lastPgn       = '';
  let isThinking    = false;
  let contextInvalid = false;

  // ─── Context guard ────────────────────────────────────────────────────────────

  function isContextValid() {
    try {
      chrome.runtime.getURL('');
      return true;
    } catch {
      if (!contextInvalid) {
        contextInvalid = true;
        clearInterval(autoInterval);
        autoInterval = null;
        if (worker) { worker.terminate(); worker = null; }
      }
      return false;
    }
  }

  // ─── Workers ──────────────────────────────────────────────────────────────────

  function buildBetafishWorkerBlob(betafishUrl, chessUrl) {
    const code = `
let myGame = null, Chess = null, thinkingTime = 3;

const initPromise = (async () => {
  importScripts(${JSON.stringify(betafishUrl)});
  const mod = await import(${JSON.stringify(chessUrl)});
  Chess = mod.Chess;
  myGame = new engine();
  myGame.setThinkingTime(thinkingTime);
})().catch(err => {
  self.postMessage({ type: 'ERROR', text: 'Engine init failed: ' + err.message });
  throw err;
});

self.onmessage = async function(e) {
  const { type } = e.data;

  if (type === 'SET_TIME') {
    thinkingTime = e.data.seconds;
    if (myGame) myGame.setThinkingTime(thinkingTime);
    return;
  }

  if (type === 'COMPUTE') {
    const { pgn, time } = e.data;
    try {
      await initPromise;
      if (time != null) { thinkingTime = time; myGame.setThinkingTime(thinkingTime); }

      const chess = new Chess();
      let fen;
      if (pgn && pgn.trim()) {
        if (!chess.load_pgn(pgn)) {
          self.postMessage({ type: 'ERROR', text: 'PGN parse failed: ' + pgn.slice(0, 60) });
          return;
        }
        fen = chess.fen();
      } else {
        fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      }

      myGame.reset();
      myGame.setFEN(fen);
      const status = myGame.gameStatus();
      if (status.over) {
        self.postMessage({ type: 'GAME_OVER', text: String(status.over), side: status.sideToMove });
        return;
      }
      self.postMessage({ type: 'LOG', text: 'Thinking... (' + thinkingTime + 's)' });
      const bestMove = myGame.getBestMove();
      if (!bestMove) { self.postMessage({ type: 'ERROR', text: 'No legal moves found' }); return; }
      self.postMessage({ type: 'RESULT', from: myGame.fromSQ(bestMove), to: myGame.toSQ(bestMove), side: status.sideToMove, fen });
    } catch (err) {
      self.postMessage({ type: 'ERROR', text: err.message });
    }
  }
};
`;
    return new Blob([code], { type: 'application/javascript' });
  }

  function buildStockfishWorkerBlob(sfJsUrl, sfWasmUrl, chessUrl) {
    // Inner blob: just sets locateFile so WASM is resolved correctly, then imports Stockfish.
    // Stockfish takes over self.onmessage and speaks raw UCI.
    const innerCode = `var Module={locateFile:function(){return ${JSON.stringify(sfWasmUrl)}}};importScripts(${JSON.stringify(sfJsUrl)});`;

    // Outer blob: UCI adapter. Owns self.onmessage from our app, talks to inner worker in UCI.
    const code = `
let Chess = null, sfWorker = null, sfReady = false;
let pendingResolve = null, pendingCompute = null;

const chessReady = import(${JSON.stringify(chessUrl)}).then(m => { Chess = m.Chess; });

const sfBlob = new Blob([${JSON.stringify(innerCode)}], { type: 'application/javascript' });
const sfBlobUrl = URL.createObjectURL(sfBlob);
sfWorker = new Worker(sfBlobUrl);
URL.revokeObjectURL(sfBlobUrl);

sfWorker.onmessage = function(e) {
  const line = e.data;
  if (typeof line !== 'string') return;
  if (line === 'readyok') {
    sfReady = true;
    if (pendingCompute) { const d = pendingCompute; pendingCompute = null; doCompute(d); }
    return;
  }
  if (line.startsWith('bestmove')) {
    const mv = line.split(' ')[1];
    if (pendingResolve) { pendingResolve(mv); pendingResolve = null; }
  }
};

sfWorker.postMessage('uci');
sfWorker.postMessage('isready');

async function doCompute({ pgn, time }) {
  await chessReady;
  const chess = new Chess();
  let fen;
  if (pgn && pgn.trim()) {
    if (!chess.load_pgn(pgn)) {
      self.postMessage({ type: 'ERROR', text: 'PGN parse failed' });
      return;
    }
    fen = chess.fen();
  } else {
    fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  }
  const side = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  sfWorker.postMessage('ucinewgame');
  sfWorker.postMessage('position fen ' + fen);
  self.postMessage({ type: 'LOG', text: 'Thinking... (' + time + 's)' });
  const bestMove = await new Promise(r => { pendingResolve = r; sfWorker.postMessage('go movetime ' + (time * 1000)); });
  if (!bestMove || bestMove === '(none)') {
    self.postMessage({ type: 'GAME_OVER', text: 'No legal moves', side });
    return;
  }
  self.postMessage({ type: 'RESULT_ALG', from: bestMove.slice(0, 2).toUpperCase(), to: bestMove.slice(2, 4).toUpperCase(), side });
}

self.onmessage = async function(e) {
  if (e.data.type === 'COMPUTE') {
    if (!sfReady) { pendingCompute = e.data; return; }
    await doCompute(e.data);
  }
};
`;
    return new Blob([code], { type: 'application/javascript' });
  }

  function initWorker() {
    if (worker || !isContextValid()) return;

    const chessUrl = chrome.runtime.getURL('chess.js');
    const blob = engineType === 'stockfish'
      ? buildStockfishWorkerBlob(
          chrome.runtime.getURL('stockfish.js'),
          chrome.runtime.getURL('stockfish.wasm'),
          chessUrl
        )
      : buildBetafishWorkerBlob(chrome.runtime.getURL('betafish.js'), chessUrl);

    const blobUrl = URL.createObjectURL(blob);
    try {
      worker = new Worker(blobUrl);
      URL.revokeObjectURL(blobUrl);
      worker.onmessage = handleWorkerMessage;
      worker.onerror   = (e) => { isThinking = false; sendLog('error', 'Worker error: ' + (e.message || e.type)); };
    } catch (e) {
      URL.revokeObjectURL(blobUrl);
      worker = null;
      sendLog('error', 'Worker init failed: ' + e.message);
    }
  }

  function handleWorkerMessage(e) {
    const msg = e.data;
    switch (msg.type) {
      case 'RESULT': {
        isThinking = false;
        const fromAlg = sq120ToAlg(msg.from);
        const toAlg   = sq120ToAlg(msg.to);
        highlightBestMove(fromAlg, toAlg, msg.side);
        sendLog('move', fromAlg + ' → ' + toAlg + ' (' + msg.side + ')');
        chrome.runtime.sendMessage({ type: 'RESULT' }).catch(() => {});
        break;
      }
      case 'RESULT_ALG': {
        isThinking = false;
        highlightBestMove(msg.from, msg.to, msg.side);
        sendLog('move', msg.from + ' → ' + msg.to + ' (' + msg.side + ')');
        chrome.runtime.sendMessage({ type: 'RESULT' }).catch(() => {});
        break;
      }
      case 'GAME_OVER':
        isThinking = false;
        resetHighlight();
        sendLog('info', 'Game over: ' + msg.text);
        chrome.runtime.sendMessage({ type: 'GAME_OVER', text: msg.text });
        break;
      case 'ERROR':
        isThinking = false;
        sendLog('error', msg.text);
        break;
      case 'LOG':
        sendLog('info', msg.text);
        break;
    }
  }

  // ─── DOM Helpers ──────────────────────────────────────────────────────────────

  function qs(selector, root)  { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function getCurrentPgn() {
    let pgn     = '';
    let counter = 1;

    qsa('#live-game-tab-scroll-container .move-list-row').forEach((row) => {
      let moves = '';
      let found = false;

      qsa('div.node .node-highlight-content', row).forEach((cell) => {
        let move = '';
        for (const node of cell.childNodes) {
          if (node.nodeType === 3) move += node.nodeValue.trim();
          else if (node.nodeType === 1) move += node.dataset.figurine || '';
        }
        found = true;
        moves += move + ' ';
      });

      if (found) pgn += counter + '. ' + moves;
      counter++;
    });

    return pgn.trim();
  }

  function detectPlayerColor() {
    const clock = qs('#board-layout-player-bottom .clock-component');
    if (clock) {
      if (clock.classList.contains('clock-white')) return WHITE;
      if (clock.classList.contains('clock-black')) return BLACK;
    }
    const pieces = qs('#board-layout-player-bottom wc-captured-pieces');
    if (pieces) {
      const pc = pieces.getAttribute('player-color');
      if (pc === '1') return WHITE;
      if (pc === '2') return BLACK;
    }
    return null;
  }

  function isMyTurn() {
    const halfMoves  = qsa('#live-game-tab-scroll-container .move-list-row .node').length;
    const sideToMove = (halfMoves % 2 === 0) ? WHITE : BLACK;
    return myColor === sideToMove;
  }

  // ─── Highlight ────────────────────────────────────────────────────────────────

  function sq120ToAlg(sq120) {
    return SQ120_TO_ALGEBRAIC[String(sq120)] || '';
  }

  function algToChesscomClass(alg) {
    if (!alg || alg.length < 2) return null;
    const fileNum = alg.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
    const rankNum = parseInt(alg[1]);
    return 'square-' + fileNum + rankNum;
  }

  function highlightBestMove(fromAlg, toAlg) {
    resetHighlight();
    if (!fromAlg || !toAlg) return;

    const board = qs('#board-layout-chessboard');
    if (!board) return;

    const fromClass = algToChesscomClass(fromAlg);
    const toClass   = algToChesscomClass(toAlg);

    if (fromClass) qs('.' + fromClass, board)?.classList.add('chess-hint-from');
    if (toClass)   qs('.' + toClass,   board)?.classList.add('chess-hint-to');

    drawArrow(board, fromAlg, toAlg);
  }

  function drawArrow(board, fromAlg, toAlg) {
    const sqW = board.offsetWidth  / 8;
    const sqH = board.offsetHeight / 8;

    function sqCenter(alg) {
      let fileIdx = alg.charCodeAt(0) - 'A'.charCodeAt(0);
      let rankIdx = parseInt(alg[1]) - 1;
      if (myColor === BLACK) { fileIdx = 7 - fileIdx; rankIdx = 7 - rankIdx; }
      return { x: fileIdx * sqW + sqW / 2, y: (7 - rankIdx) * sqH + sqH / 2 };
    }

    const from  = sqCenter(fromAlg);
    const to    = sqCenter(toAlg);
    const dx    = to.x - from.x;
    const dy    = to.y - from.y;
    const len   = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const arrowW = Math.max(4, sqW * 0.12);

    const arrow = document.createElement('div');
    arrow.className = 'chess-hint-arrow';
    Object.assign(arrow.style, {
      position:        'absolute',
      left:            from.x + 'px',
      top:             from.y + 'px',
      width:           len + 'px',
      height:          arrowW + 'px',
      marginTop:       -(arrowW / 2) + 'px',
      transformOrigin: '0 50%',
      transform:       'rotate(' + angle + 'deg)',
      pointerEvents:   'none',
      zIndex:          '1000',
    });

    board.style.position = 'relative';
    board.appendChild(arrow);
  }

  function resetHighlight() {
    qsa('.chess-hint-from').forEach(el => el.classList.remove('chess-hint-from'));
    qsa('.chess-hint-to').forEach(el => el.classList.remove('chess-hint-to'));
    qsa('.chess-hint-arrow').forEach(el => el.remove());
  }

  // ─── Hint Logic ───────────────────────────────────────────────────────────────

  function getHint() {
    if (contextInvalid || isThinking) return;

    if (!qs('#board-layout-chessboard') && !qs('#board-single')) {
      sendLog('warn', 'No game detected — open a live game on chess.com');
      return;
    }

    const detected = detectPlayerColor();
    if (detected !== null) {
      myColor = detected;
      chrome.runtime.sendMessage({ type: 'COLOR_DETECTED', color: myColor }).catch(() => {});
    }

    initWorker();
    if (!worker) { sendLog('error', 'Worker failed to init'); return; }

    resetHighlight();
    isThinking = true;
    sendLog('info', 'Computing hint…');
    worker.postMessage({ type: 'COMPUTE', pgn: getCurrentPgn(), time: thinkingTime });
  }

  function safeAutoHint() {
    if (contextInvalid || isThinking) return;
    const pgn = getCurrentPgn();
    if (pgn === lastPgn) return;
    lastPgn = pgn;
    if (!isMyTurn()) return;
    getHint();
  }

  function sendLog(level, text) {
    if (contextInvalid) return;
    try {
      chrome.runtime.sendMessage({ type: 'LOG', level, text }).catch(() => {});
    } catch {
      isContextValid();
    }
  }

  // ─── Message Listener ────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'PING': break;

      case 'GET_HINT':
        getHint();
        break;

      case 'SET_AUTO':
        if (msg.enabled) {
          lastPgn = '';
          autoInterval = autoInterval || setInterval(safeAutoHint, 500);
          sendLog('info', 'Auto hint ON');
        } else {
          clearInterval(autoInterval);
          autoInterval = null;
          sendLog('info', 'Auto hint OFF');
        }
        break;

      case 'SET_TIME':
        thinkingTime = msg.seconds;
        if (worker) worker.postMessage({ type: 'SET_TIME', seconds: msg.seconds });
        sendLog('info', 'Thinking time: ' + msg.seconds + 's');
        break;

      case 'SET_ENGINE':
        engineType = msg.engine;
        if (worker) { worker.terminate(); worker = null; }
        isThinking = false;
        sendLog('info', 'Engine: ' + msg.engine);
        break;

      case 'CLEAR_HIGHLIGHT':
        resetHighlight();
        break;
    }
  });

} // end idempotency guard
