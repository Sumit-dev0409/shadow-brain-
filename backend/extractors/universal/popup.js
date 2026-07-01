// ============================================================
// Brain Shadow — Universal Popup Script
//
// Clicking "Bulk Import" starts scraping the CURRENT platform.
// If another platform is already scraping in the background,
// that continues unaffected — they run concurrently.
// Closing the popup never stops any scraping session.
// ============================================================

const EXPORT_NAME = 'brain_shadow_universal';

const PLATFORM_BASE_URLS = {
  'chat.openai.com':       { platform: 'chatgpt',    baseUrl: 'https://chatgpt.com'            },
  'chatgpt.com':           { platform: 'chatgpt',    baseUrl: 'https://chatgpt.com'            },
  'claude.ai':             { platform: 'claude',     baseUrl: 'https://claude.ai/recents'      },
  'gemini.google.com':     { platform: 'gemini',     baseUrl: 'https://gemini.google.com/app'  },
  'www.blackbox.ai':       { platform: 'blackbox',   baseUrl: 'https://www.blackbox.ai'        },
  'blackbox.ai':           { platform: 'blackbox',   baseUrl: 'https://www.blackbox.ai'        },
  'chat.deepseek.com':     { platform: 'deepseek',   baseUrl: 'https://chat.deepseek.com'      },
  'copilot.microsoft.com': { platform: 'copilot',    baseUrl: 'https://copilot.microsoft.com'  },
  'github.com':            { platform: 'copilot',    baseUrl: 'https://github.com/copilot'     },
  'www.perplexity.ai':     { platform: 'perplexity', baseUrl: 'https://www.perplexity.ai/library' },
  'perplexity.ai':         { platform: 'perplexity', baseUrl: 'https://www.perplexity.ai/library' },
  'grok.com':              { platform: 'grok',       baseUrl: 'https://grok.com'               },
  'x.com':                 { platform: 'grok',       baseUrl: 'https://grok.com'               },
};

const PLATFORM_LABELS = {
  chatgpt: 'ChatGPT 🤖', claude: 'Claude 🧠', gemini: 'Gemini ✨',
  deepseek: 'DeepSeek ⬡', blackbox: 'Blackbox ■', copilot: 'Copilot 🪟',
  perplexity: 'Perplexity 🔍', grok: 'Grok 𝕏',
};

// ── Toast ──────────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ── Backend status ─────────────────────────────────────────
function setBackendStatus(state, msg) {
  document.getElementById('backendStatus').className = `backend-status ${state}`;
  document.getElementById('backendStatusText').textContent = msg;
}

async function testBackend(url) {
  setBackendStatus('idle', 'Testing…');
  try {
    const backendUrl = (url || 'http://localhost:8000').replace(/\/$/, '');
    const res = await fetch(`${backendUrl}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setBackendStatus('ok', '✓ Backend connected — syncing all chats…');
    // Sync all unsynced conversations directly from popup context
    await syncAllToBackend(backendUrl);
    return true;
  } catch (err) {
    setBackendStatus('error', `✗ Backend offline: ${err.message}`);
    console.error('[Brain Shadow] Backend test failed:', err.message);
    return false;
  }
}

async function syncAllToBackend(backendUrl) {
  const convs = await chrome.runtime.sendMessage({ type: 'GET_ALL_CONVERSATIONS' });
  if (!convs?.length) return;
  // Only sync conversations that haven't been synced yet
  const unsynced = convs.filter(c => !c.synced);
  if (!unsynced.length) return;
  let synced = 0;
  for (const conv of unsynced) {
    try {
      const res = await fetch(`${backendUrl}/api/import/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conv),
      });
      if (res.ok) synced++;
    } catch {}
  }
  if (synced > 0) {
    setBackendStatus('ok', `✓ Synced ${synced} / ${convs.length} chats to MongoDB`);
    showToast(`Synced ${synced} chats to MongoDB ✅`, 'success');
    await loadStats();
    await loadRecentConversations();
  }
}

// ── Stats + platform badges ────────────────────────────────
async function loadStats() {
  const meta = await chrome.runtime.sendMessage({ type: 'GET_META' });
  if (!meta) return;
  document.getElementById('totalConvs').textContent     = meta.total_conversations || 0;
  document.getElementById('totalMsgs').textContent      = meta.total_messages      || 0;
  document.getElementById('totalPlatforms').textContent = Object.keys(meta.platforms || {}).length;

  const platforms = meta.platforms || {};
  const div = document.getElementById('platformBadges');
  div.innerHTML = '';
  if (!Object.keys(platforms).length) {
    div.innerHTML = '<span style="font-size:10px;color:var(--muted);padding:3px 0">No data yet — open an AI platform and click Bulk Import</span>';
    return;
  }
  Object.entries(platforms).sort((a, b) => b[1] - a[1]).forEach(([p, count]) => {
    const label = PLATFORM_LABELS[p] || p;
    const el = document.createElement('div');
    el.className = 'badge active';
    el.innerHTML = `<span class="dot"></span>${label} (${count})`;
    div.appendChild(el);
  });
}

// ── Recent conversations ───────────────────────────────────
async function loadRecentConversations() {
  const convs = await chrome.runtime.sendMessage({ type: 'GET_ALL_CONVERSATIONS' });
  const list  = document.getElementById('convList');
  if (!convs?.length) { list.innerHTML = '<div class="empty-state">No conversations captured yet</div>'; return; }
  list.innerHTML = convs.slice(0, 10).map(conv => `
    <div class="conv-item">
      <span class="conv-platform">${conv.platform.substring(0,3).toUpperCase()}</span>
      <span class="conv-title" title="${conv.title||''}">${conv.title||'Untitled'}</span>
      <span class="conv-msgs">${conv.message_count||0}msg</span>
      <span class="conv-sync">${conv.synced === true ? '☁️' : conv.synced === false ? '⚠️' : ''}</span>
    </div>`).join('');
}

// ── Render sessions bar + progress ────────────────────────
function renderProgress(prog) {
  if (!prog?.sessions) return;

  const sessions    = prog.sessions;
  const runningSess = Object.entries(sessions).filter(([, s]) => s.running);
  const anyRunning  = runningSess.length > 0;

  // Sessions bar (shows all active platform names)
  const bar = document.getElementById('sessionsBar');
  bar.classList.toggle('visible', anyRunning);
  if (anyRunning) {
    document.getElementById('sessionsList').innerHTML = runningSess.map(([p, s]) => `
      <div class="session-chip">
        <span class="spin">◌</span>
        ${PLATFORM_LABELS[p] || p} — ${s.current||0}/${s.total||'?'}
      </div>`).join('');
  }

  // Progress bar for current tab's platform
  const currentPlatform = currentTabPlatform();
  const currentSess     = currentPlatform ? sessions[currentPlatform] : null;

  const progSection = document.getElementById('progressSection');
  if (currentSess && (currentSess.running || currentSess.done)) {
    progSection.classList.add('visible');
    document.getElementById('progressFill').style.width  = `${currentSess.pct || 0}%`;
    document.getElementById('progressCount').textContent = `${currentSess.current||0} / ${currentSess.total||0}`;
    document.getElementById('progressTitle').textContent = currentSess.title || '…';
    document.getElementById('progressLabel').textContent =
      currentSess.running ? `Scraping ${PLATFORM_LABELS[currentPlatform] || currentPlatform}…` :
      currentSess.done    ? '✅ Done' : 'Starting…';
  } else if (!anyRunning) {
    progSection.classList.remove('visible');
  }

  // Bulk import button state
  const btn = document.getElementById('btnBulkImport');
  const thisPlatformRunning = currentPlatform && sessions[currentPlatform]?.running;

  if (thisPlatformRunning) {
    btn.disabled    = true;
    btn.textContent = `⏳ Scraping ${PLATFORM_LABELS[currentPlatform] || currentPlatform}…`;
  } else {
    btn.disabled    = false;
    btn.textContent = '⚡ Bulk Import All Past Chats';
  }

  // Force stop button — visible when ANY session is running
  document.getElementById('btnForceStop').style.display = anyRunning ? 'flex' : 'none';

  // Refresh stats when a session just finished
  const justFinished = Object.values(sessions).some(s => s.done && !s.running);
  if (justFinished) { loadStats(); loadRecentConversations(); }
}

// Detect platform from the active tab's URL (cached from last query)
let _currentTabInfo = null;
function currentTabPlatform() {
  return _currentTabInfo?.platform || null;
}

// ── Bulk Import — starts scraping for current tab's platform ─
document.getElementById('btnBulkImport').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { showToast('Cannot detect current page', 'error'); return; }

  const host    = new URL(tab.url).hostname;
  const match   = PLATFORM_BASE_URLS[host] ||
                  Object.entries(PLATFORM_BASE_URLS).find(([h]) => host.includes(h))?.[1];

  if (!match) { showToast('Open an AI platform tab first (ChatGPT, DeepSeek, Gemini…)', 'error'); return; }

  _currentTabInfo = match;

  const result = await chrome.runtime.sendMessage({
    type:     'START_PLATFORM_IMPORT',
    platform: match.platform,
    baseUrl:  match.baseUrl,
  });

  if (result?.status === 'already_running') {
    showToast(`${PLATFORM_LABELS[match.platform] || match.platform} is already scraping`, 'success');
  } else if (result?.status === 'started') {
    showToast(`Started ${PLATFORM_LABELS[match.platform] || match.platform} — popup can be closed safely!`, 'success');
    document.getElementById('btnBulkImport').disabled    = true;
    document.getElementById('btnBulkImport').textContent = `⏳ Scraping…`;
    document.getElementById('btnForceStop').style.display = 'flex';
    document.getElementById('progressSection').classList.add('visible');
    document.getElementById('progressLabel').textContent  = `Scraping ${PLATFORM_LABELS[match.platform] || match.platform}…`;
    document.getElementById('progressTitle').textContent  = 'Opening background tab…';
  }
});

// ── Sync All to MongoDB ────────────────────────────────────
document.getElementById('btnSyncNow').addEventListener('click', async () => {
  const btn = document.getElementById('btnSyncNow');
  btn.disabled = true;
  btn.textContent = '⏳ Syncing…';
  const urlResult  = await chrome.runtime.sendMessage({ type: 'GET_BACKEND_URL' });
  const backendUrl = (urlResult?.url || 'http://localhost:8000').replace(/\/$/, '');
  try {
    const res = await fetch(`${backendUrl}/health`);
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    await syncAllToBackend(backendUrl);
  } catch (e) {
    setBackendStatus('error', `✗ ${e.message}`);
    showToast(`Backend offline: ${e.message}`, 'error');
  }
  btn.disabled = false;
  btn.textContent = '🔄 Sync All to MongoDB';
});

// ── Force Stop All ─────────────────────────────────────────
document.getElementById('btnForceStop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'STOP_ALL_IMPORTS' });
  document.getElementById('btnForceStop').textContent = '⏹ Stopping…';
  document.getElementById('btnForceStop').disabled    = true;
  showToast('Stopping all sessions — current chats will finish first', 'error');
});

// ── Capture Current ────────────────────────────────────────
document.getElementById('btnCaptureCurrent').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host  = tab?.url ? new URL(tab.url).hostname : '';
  const match = PLATFORM_BASE_URLS[host] ||
                Object.entries(PLATFORM_BASE_URLS).find(([h]) => host.includes(h))?.[1];

  if (!match) { showToast('Open a supported AI platform first', 'error'); return; }

  const btn = document.getElementById('btnCaptureCurrent');
  btn.disabled = true; btn.textContent = '⏳';

  chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CURRENT' }, (result) => {
    btn.disabled = false; btn.textContent = '📸 Capture Current';
    if (chrome.runtime.lastError || result?.status === 'error') { showToast('Capture failed — refresh page', 'error'); return; }
    if (result?.status === 'empty') { showToast('Nothing to capture yet', 'error'); return; }
    setTimeout(() => { loadStats(); loadRecentConversations(); }, 600);
    setBackendStatus(result?.synced ? 'ok' : 'error', result?.synced ? '✓ Captured & synced to MongoDB' : 'Captured locally (backend offline)');
    showToast(result?.synced ? `Captured & synced: ${result?.title||''}` : 'Saved locally', result?.synced ? 'success' : 'error');
  });
});

// ── Export JSON ────────────────────────────────────────────
document.getElementById('btnExport').addEventListener('click', async () => {
  const data = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
  if (!data?.conversations?.length) { showToast('No data to export', 'error'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${EXPORT_NAME}_${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast(`Exported ${data.conversations.length} conversations`, 'success');
});

// ── Clear Data ─────────────────────────────────────────────
document.getElementById('btnClear').addEventListener('click', async () => {
  if (!confirm('Delete all captured conversations? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
  await loadStats(); await loadRecentConversations();
  document.getElementById('progressSection').classList.remove('visible');
  document.getElementById('sessionsBar').classList.remove('visible');
  showToast('All data cleared');
});

// ── Backend URL ────────────────────────────────────────────
document.getElementById('btnTestUrl').addEventListener('click', async () => {
  await testBackend(document.getElementById('backendUrl').value.trim() || 'http://localhost:8000');
});
document.getElementById('btnSaveUrl').addEventListener('click', async () => {
  const url = document.getElementById('backendUrl').value.trim(); if (!url) return;
  await chrome.runtime.sendMessage({ type: 'SET_BACKEND_URL', url });
  showToast('Saved', 'success'); await testBackend(url);
});

// ── Live updates from storage ──────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes['brain_shadow_scrape_progress']) {
    renderProgress(changes['brain_shadow_scrape_progress'].newValue);
  }
  if (changes['brain_shadow_conversations'] || changes['brain_shadow_meta']) {
    loadStats(); loadRecentConversations();
  }
});

// ── Init ───────────────────────────────────────────────────
(async () => {
  const urlResult  = await chrome.runtime.sendMessage({ type: 'GET_BACKEND_URL' });
  document.getElementById('backendUrl').value = urlResult?.url || 'http://localhost:8000';

  // Detect current tab's platform
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    const host  = new URL(tab.url).hostname;
    _currentTabInfo = PLATFORM_BASE_URLS[host] ||
                      Object.entries(PLATFORM_BASE_URLS).find(([h]) => host.includes(h))?.[1] || null;
  }

  await loadStats();
  await loadRecentConversations();

  // Restore any in-progress sessions
  const prog = await chrome.runtime.sendMessage({ type: 'GET_SCRAPE_PROGRESS' });
  if (prog) renderProgress(prog);

  // Test backend directly from popup (not via service worker)
  await testBackend(urlResult?.url || 'http://localhost:8000');
})();
