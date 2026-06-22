const statusEl        = document.getElementById('status');
const detailsEl       = document.getElementById('details');
const progressBar     = document.getElementById('progressBar');
const extractAllBtn   = document.getElementById('extractAllBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const clearCacheBtn   = document.getElementById('clearCacheBtn');
const backendUrlEl    = document.getElementById('backendUrl');
const btnSaveUrl      = document.getElementById('btnSaveUrl');

function setStatus(text, color = '#aaa') {
  statusEl.textContent = text;
  statusEl.style.color = color;
}
function setDetails(text) { detailsEl.textContent = text; }
function setProgress(v) {
  progressBar.style.display = v > 0 ? 'block' : 'none';
  progressBar.value = v;
}

// ── Progress from background ───────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'scrapeProgress') {
    setStatus(`Scanning ${msg.current} of ${msg.total} chats…`, '#aaa');
    setDetails(`${msg.title} — ${msg.messages || 0} messages`);
    setProgress(msg.percentage || 0);
  }
  if (msg.action === 'downloadStatus') {
    setStatus(msg.message || '', '#aaa');
  }
});

// ── Retry helper (content script loads after page "complete") ─
function sendWithRetry(tabId, message, maxAttempts = 8, delayMs = 1200) {
  return new Promise(async (resolve, reject) => {
    for (let i = 1; i <= maxAttempts; i++) {
      const result = await new Promise((res) => {
        chrome.tabs.sendMessage(tabId, message, (r) => {
          res(chrome.runtime.lastError
            ? { ok: false, error: chrome.runtime.lastError.message }
            : { ok: true, data: r });
        });
      });
      if (result.ok) { resolve(result.data); return; }
      if (i === maxAttempts) { reject(new Error(result.error)); return; }
      setStatus(`Waiting for page… (${i}/${maxAttempts})`, '#888');
      await new Promise(r => setTimeout(r, delayMs));
    }
  });
}

// ── Scan all conversations ─────────────────────────────────
async function extractAllConversations() {
  extractAllBtn.disabled = true;
  extractAllBtn.textContent = '⏳ Scanning…';
  setDetails('');
  setProgress(0);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes('gemini.google.com')) {
    setStatus('Open gemini.google.com first.', '#ea4335');
    resetBtn();
    return;
  }

  // Navigate to main Gemini page to access sidebar if not there
  if (!tab.url.includes('gemini.google.com/app')) {
    setStatus('Navigating to Gemini…', '#aaa');
    await chrome.tabs.update(tab.id, { url: 'https://gemini.google.com/app' });

    await new Promise((resolve) => {
      const onUpdate = (id, info) => {
        if (id === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdate);
          setTimeout(resolve, 1200);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdate);
      setTimeout(resolve, 7000);
    });
  }

  setStatus('Reading conversation list…', '#aaa');

  let response;
  try {
    response = await sendWithRetry(tab.id, { action: 'extractRecents' });
  } catch (err) {
    setStatus('Refresh gemini.google.com and try again.', '#ea4335');
    setDetails('Content script not reachable — page may still be loading.');
    resetBtn();
    return;
  }

  const threads = response?.threads || [];
  if (threads.length === 0) {
    setStatus('No conversations found in sidebar.', '#888');
    resetBtn();
    return;
  }

  setStatus(`Found ${threads.length} conversations! Starting scan…`, '#aaa');
  setProgress(1);

  chrome.runtime.sendMessage({ action: 'scrapeAllConversations', threads }, (result) => {
    if (chrome.runtime.lastError) {
      setStatus(`Error: ${chrome.runtime.lastError.message}`, '#ea4335');
      resetBtn();
      return;
    }

    const convs          = result?.conversations || [];
    const totalMsgs      = convs.reduce((acc, c) => acc + (c.newMessagesCount || 0), 0);
    const chatsWithMsgs  = convs.filter(c => c.newMessagesCount > 0).length;

    setStatus(`✓ Done! ${chatsWithMsgs} chats — ${totalMsgs} messages`, '#34a853');
    setDetails('JSON auto-downloading…');
    setProgress(100);
    downloadJsonBtn.style.display = 'flex';
    resetBtn();
  });
}

function resetBtn() {
  extractAllBtn.disabled = false;
  extractAllBtn.textContent = '🔄 Scan All Conversations';
}

extractAllBtn.addEventListener('click', extractAllConversations);

// ── Download JSON ──────────────────────────────────────────
downloadJsonBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_DATA' }, (data) => {
    if (!data) { setStatus('No data to download.', '#ea4335'); return; }
    const json     = JSON.stringify(data, null, 2);
    const dataUrl  = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    const filename = `brain_shadow_gemini_${new Date().toISOString().slice(0, 10)}.json`;
    chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, () => {
      setStatus('✓ Downloaded!', '#34a853');
      setTimeout(() => setStatus(''), 2000);
    });
  });
});

// ── Clear cache ────────────────────────────────────────────
clearCacheBtn.addEventListener('click', () => {
  if (!confirm('Clear all saved Brain Shadow data? This cannot be undone.')) return;
  chrome.runtime.sendMessage({ type: 'CLEAR_DATA' }, () => {
    setStatus('✓ All data cleared.', '#34a853');
    setDetails('');
    setProgress(0);
    downloadJsonBtn.style.display = 'none';
    setTimeout(() => setStatus(''), 3000);
  });
});

// ── Backend URL ────────────────────────────────────────────
btnSaveUrl.addEventListener('click', () => {
  const url = backendUrlEl.value.trim();
  if (!url) return;
  chrome.runtime.sendMessage({ type: 'SET_BACKEND_URL', url }, () => {
    setStatus('Backend URL saved.', '#34a853');
    setTimeout(() => setStatus(''), 1500);
  });
});

// ── Init ───────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_BACKEND_URL' }, (result) => {
  backendUrlEl.value = result?.url || 'http://localhost:8000';
});
