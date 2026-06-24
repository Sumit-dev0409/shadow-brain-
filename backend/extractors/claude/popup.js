// Brain Shadow — Claude Popup Script

const PLATFORM_URL = 'claude.ai';
const BASE_URL     = 'https://claude.ai/recents';  // shows full conversation history
const EXTRA_WAIT   = 2000;
const EXPORT_NAME  = 'brain_shadow_claude';
let isBulkRunning  = false;

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 2500);
}

async function loadStats() {
  const meta = await chrome.runtime.sendMessage({ type: 'GET_META' });
  document.getElementById('totalConvs').textContent     = meta.total_conversations || 0;
  document.getElementById('totalMsgs').textContent      = meta.total_messages      || 0;
  document.getElementById('totalPlatforms').textContent = Object.keys(meta.platforms || {}).length;
  const platforms = meta.platforms || {};
  ['claude','chatgpt','gemini','deepseek','blackbox','copilot'].forEach(p => {
    const badge = document.getElementById(`badge-${p}`);
    if (!badge) return;
    if (platforms[p]) { badge.classList.add('active'); badge.innerHTML = `<span class="dot"></span>${p.charAt(0).toUpperCase() + p.slice(1)} (${platforms[p]})`; }
    else badge.classList.remove('active');
  });
}

async function loadRecentConversations() {
  const conversations = await chrome.runtime.sendMessage({ type: 'GET_ALL_CONVERSATIONS' });
  const list = document.getElementById('convList');
  if (!conversations || conversations.length === 0) { list.innerHTML = '<div class="empty-state">No conversations captured yet</div>'; return; }
  list.innerHTML = conversations.slice(0, 8).map(conv => `
    <div class="conv-item">
      <span class="conv-platform">${conv.platform.substring(0, 3).toUpperCase()}</span>
      <span class="conv-title" title="${conv.title || ''}">${conv.title || 'Untitled'}</span>
      <span class="conv-msgs">${conv.message_count || conv.messages?.length || 0}msg</span>
    </div>
  `).join('');
}

function showProgress(count, total, currentTitle = '') {
  document.getElementById('progressSection').classList.add('visible');
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  document.getElementById('progressFill').style.width  = `${pct}%`;
  document.getElementById('progressCount').textContent = `${count} / ${total}`;
  document.getElementById('progressTitle').textContent = currentTitle || '';
  document.getElementById('progressLabel').textContent = count === total && total > 0 ? '✅ Import complete' : 'Importing...';
}

function hideProgress() { document.getElementById('progressSection').classList.remove('visible'); }

function navigateAndWait(tabId, url, extraMs = EXTRA_WAIT) {
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, { url });
    const onUpdate = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdate);
      setTimeout(resolve, extraMs);
    };
    chrome.tabs.onUpdated.addListener(onUpdate);
    setTimeout(resolve, 12000);
  });
}

async function waitForPageReady(tabId, maxWaitMs = 30000) {
  const start = Date.now(); let lastCount = 0, stableCount = 0;
  while (Date.now() - start < maxWaitMs) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (r?.pong) { const n = r.messageCount || 0; if (n === lastCount) { stableCount++; if (stableCount >= 3) return true; } else { stableCount = 0; lastCount = n; } }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return true;
}

function resetBulkBtn() {
  isBulkRunning = false;
  const btn = document.getElementById('btnBulkImport');
  btn.disabled = false; btn.textContent = '⚡ Bulk Import All Past Chats';
}

document.getElementById('btnBulkImport').addEventListener('click', async () => {
  if (isBulkRunning) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url?.includes(PLATFORM_URL)) { showToast(`Open ${PLATFORM_URL} first`, 'error'); return; }

  isBulkRunning = true;
  document.getElementById('btnBulkImport').disabled = true;
  document.getElementById('btnBulkImport').textContent = '⏳ Loading sidebar...';
  showProgress(0, 0, 'Navigating to recents...');

  await navigateAndWait(tab.id, BASE_URL, EXTRA_WAIT);

  chrome.tabs.sendMessage(tab.id, { type: 'GET_SIDEBAR_CHATS' }, async (threads) => {
    if (chrome.runtime.lastError) { showToast('Page not ready — refresh and try again', 'error'); resetBulkBtn(); hideProgress(); return; }
    if (!threads || threads.length === 0) { showToast('No chats found in sidebar', 'error'); resetBulkBtn(); hideProgress(); return; }

    const existingConvs = await chrome.runtime.sendMessage({ type: 'GET_ALL_CONVERSATIONS' });
    const capturedPaths = new Set((existingConvs || []).map(c => { try { return new URL(c.url).pathname; } catch { return c.url; } }));
    const newThreads = threads.filter(t => { try { return !capturedPaths.has(new URL(t.url).pathname); } catch { return true; } });
    const skippedCount = threads.length - newThreads.length;
    if (newThreads.length === 0) { showToast(skippedCount > 0 ? `All ${threads.length} chats already captured!` : 'No new chats found', 'success'); resetBulkBtn(); hideProgress(); return; }
    if (skippedCount > 0) console.log(`[Brain Shadow] Skipping ${skippedCount} already-captured chats`);

    showProgress(0, newThreads.length, `${newThreads.length} new chats (${skippedCount} already captured)`);
    let savedCount = 0;

    for (let i = 0; i < newThreads.length; i++) {
      const { url, title } = newThreads[i];
      showProgress(i, newThreads.length, title);
      try {
        await navigateAndWait(tab.id, url, 1500);
        await waitForPageReady(tab.id);
        for (let attempt = 0; attempt < 3; attempt++) {
          try { const r = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CURRENT' }); if (r?.status === 'saved' || r?.status === 'skipped') break; } catch {}
          await new Promise(r => setTimeout(r, 2000));
        }
        savedCount++;
      } catch (e) { console.error('[Brain Shadow] Error on chat', i, e); }
      await new Promise(r => setTimeout(r, 300));
      if (i % 3 === 0) { loadStats(); loadRecentConversations(); }
    }

    resetBulkBtn();
    showProgress(newThreads.length, newThreads.length, `Done! Saved ${savedCount} new conversations`);
    showToast(`Done! ${savedCount} new chats saved`, 'success');
    loadStats(); loadRecentConversations(); setTimeout(hideProgress, 4000);
  });
});

document.getElementById('btnCaptureCurrent').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url?.includes(PLATFORM_URL)) { showToast(`Open ${PLATFORM_URL} first`, 'error'); return; }
  chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CURRENT' }, () => {
    setTimeout(async () => { await loadStats(); await loadRecentConversations(); showToast('Captured!', 'success'); }, 800);
  });
});

document.getElementById('btnExport').addEventListener('click', async () => {
  const data = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
  if (!data?.conversations?.length) { showToast('No data to export', 'error'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `${EXPORT_NAME}_${new Date().toISOString().split('T')[0]}.json`; a.click();
  URL.revokeObjectURL(url); showToast(`Exported ${data.conversations.length} conversations`, 'success');
});

document.getElementById('btnClear').addEventListener('click', async () => {
  if (!confirm('Delete all captured conversations? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
  await loadStats(); await loadRecentConversations(); showToast('All data cleared');
});

document.getElementById('btnSaveUrl').addEventListener('click', async () => {
  const url = document.getElementById('backendUrl').value.trim(); if (!url) return;
  await chrome.runtime.sendMessage({ type: 'SET_BACKEND_URL', url }); showToast('Backend URL saved', 'success');
});

(async () => {
  const result = await chrome.runtime.sendMessage({ type: 'GET_BACKEND_URL' });
  document.getElementById('backendUrl').value = result?.url || 'http://localhost:8000';
  await loadStats(); await loadRecentConversations();
})();
