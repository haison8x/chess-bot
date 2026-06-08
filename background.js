chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

let sidePanelPort = null;

function isChessCom(url) {
  return url && url.startsWith('https://www.chess.com/');
}

function log(level, text) {
  sidePanelPort?.postMessage({ type: 'LOG', level, text });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function isContentScriptAlive(tabId) {
  return chrome.tabs.sendMessage(tabId, { type: 'PING' })
    .then(() => true)
    .catch(() => false);
}

async function injectContentScript(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/highlight.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
  await new Promise((r) => setTimeout(r, 150));
}

async function notifyTabStatus() {
  if (!sidePanelPort) return;
  const tab = await getActiveTab();
  sidePanelPort.postMessage({
    type: 'TAB_STATUS',
    onChessCom: isChessCom(tab?.url),
    url: tab?.url || '',
  });
}

chrome.tabs.onActivated.addListener(() => notifyTabStatus());
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === 'complete') notifyTabStatus();
});

async function sendToTab(tabId, msg) {
  const alive = await isContentScriptAlive(tabId);
  if (!alive) {
    try {
      await injectContentScript(tabId);
    } catch (err) {
      log('error', 'Injection failed: ' + err.message);
      return;
    }
  }
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

async function handleCheck() {
  const tab = await getActiveTab();
  log('info', '─── Check ───');
  log('info', 'URL: ' + (tab?.url || 'none'));

  if (!isChessCom(tab?.url)) {
    log('error', 'Not on chess.com');
    return;
  }
  log('info', 'chess.com ✓');

  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        board: !!document.querySelector('#board-layout-chessboard, #board-single'),
        liveGame: !!document.getElementById('live-game-tab-scroll-container'),
      }),
    });
    const d = res.result;
    log(d.board    ? 'info' : 'warn', 'Board element: '   + (d.board    ? '✓' : '✗ not found'));
    log(d.liveGame ? 'info' : 'warn', 'Live game panel: ' + (d.liveGame ? '✓' : '✗ not found'));
  } catch (e) {
    log('warn', 'DOM inspect failed: ' + e.message);
  }

  let alive = await isContentScriptAlive(tab.id);
  if (alive) {
    log('info', 'Content script ✓ already loaded');
    return;
  }

  log('warn', 'Content script not loaded — injecting…');
  try {
    await injectContentScript(tab.id);
    alive = await isContentScriptAlive(tab.id);
    log(alive ? 'info' : 'error', alive ? 'Content script ✓ injected OK' : 'Injection failed — try reloading the tab');
  } catch (e) {
    log('error', 'Inject error: ' + e.message);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;

  sidePanelPort = port;
  port.onDisconnect.addListener(() => { sidePanelPort = null; });
  notifyTabStatus();

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'CHECK') {
      await handleCheck();
      return;
    }

    if (['GET_HINT', 'SET_AUTO', 'SET_TIME', 'SET_ENGINE', 'CLEAR_HIGHLIGHT'].includes(msg.type)) {
      const tab = await getActiveTab();
      if (!isChessCom(tab?.url)) {
        log('error', 'Open chess.com first');
        return;
      }
      await sendToTab(tab.id, msg);
    }
  });
});

// Forward messages from content script → sidepanel
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  sidePanelPort?.postMessage(msg);
  return false;
});
