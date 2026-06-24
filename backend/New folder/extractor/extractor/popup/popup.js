// ============================================================
// Brain Shadow — Popup Script
// ============================================================

let isBulkRunning = false;

// ── Toast helper ───────────────────────────────────────────
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 2500);
}

// ── Load and display stats ─────────────────────────────────
async function loadStats() {
  const meta = await chrome.runtime.sendMessage({ type: 'GET_META' });

  document.getElementById('totalConvs').textContent = meta.total_conversations || 0;
  document.getElementById('totalMsgs').textContent = meta.total_messages || 0;
  document.getElementById('totalPlatforms').textContent = Object.keys(meta.platforms || {}).length;

  // Update platform badges
  const platforms = meta.platforms || {};
  const platformNames = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', deepseek: 'DeepSeek' };
  ['chatgpt', 'claude', 'gemini', 'deepseek'].forEach(p => {
    const badge = document.getElementById(`badge-${p}`);
    if (badge) {
      const displayName = platformNames[p] || p.charAt(0).toUpperCase() + p.slice(1);
      if (platforms[p]) {
        badge.classList.add('active');
        badge.innerHTML = `<span class="dot"></span>${displayName} (${platforms[p]})`;
      } else {
        badge.classList.remove('active');
        badge.innerHTML = `<span class="dot"></span>${displayName}`;
      }
    }
  });
}

// ── Load recent conversations ──────────────────────────────
async function loadRecentConversations() {
  const conversations = await chrome.runtime.sendMessage({ type: 'GET_ALL_CONVERSATIONS' });
  const list = document.getElementById('convList');

  if (!conversations || conversations.length === 0) {
    list.innerHTML = '<div class="empty-state">No conversations captured yet</div>';
    return;
  }

  const recent = conversations.slice(0, 8);
  list.innerHTML = recent.map(conv => `
    <div class="conv-item">
      <span class="conv-platform">${conv.platform.substring(0, 3).toUpperCase()}</span>
      <span class="conv-title" title="${conv.title}">${conv.title || 'Untitled'}</span>
      <span class="conv-msgs">${conv.message_count || conv.messages?.length || 0}msg</span>
    </div>
  `).join('');
}

// ── Load backend URL ───────────────────────────────────────
async function loadBackendUrl() {
  const result = await chrome.runtime.sendMessage({ type: 'GET_BACKEND_URL' });
  document.getElementById('backendUrl').value = result.url || 'http://localhost:8000';
}

// ── Progress bar ───────────────────────────────────────────
function showProgress(count, total, currentTitle = '') {
  const section = document.getElementById('progressSection');
  const fill = document.getElementById('progressFill');
  const countEl = document.getElementById('progressCount');
  const titleEl = document.getElementById('progressTitle');
  const labelEl = document.getElementById('progressLabel');

  section.classList.add('visible');
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  fill.style.width = `${pct}%`;
  countEl.textContent = `${count} / ${total}`;
  titleEl.textContent = currentTitle || '';
  labelEl.textContent = count === total && total > 0 ? '✅ Import complete' : 'Importing...';
}

function hideProgress() {
  document.getElementById('progressSection').classList.remove('visible');
}

// ── Bulk Import ────────────────────────────────────────────
document.getElementById('btnBulkImport').addEventListener('click', async () => {
  if (isBulkRunning) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const isSupported =
    tab.url.includes('chat.openai.com') ||
    tab.url.includes('chatgpt.com') ||
    tab.url.includes('claude.ai') ||
    tab.url.includes('gemini.google.com');

  if (!isSupported) {
    showToast('Open ChatGPT, Claude, or Gemini first', 'error');
    return;
  }

  isBulkRunning = true;
  document.getElementById('btnBulkImport').disabled = true;
  document.getElementById('btnBulkImport').textContent = '⏳ Running...';

  showProgress(0, 0, 'Scanning sidebar...');

  // Request sidebar chat list from content script
  chrome.tabs.sendMessage(tab.id, { type: 'GET_SIDEBAR_CHATS' }, (chatUrls) => {
    console.log('[Brain Shadow] Callback received, chats:', chatUrls?.length);

    if (!chatUrls || chatUrls.length === 0) {
      showToast('No chats found in sidebar', 'error');
      isBulkRunning = false;
      document.getElementById('btnBulkImport').disabled = false;
      document.getElementById('btnBulkImport').textContent = '⚡ Bulk Import All Past Chats';
      return;
    }

    console.log(`[Brain Shadow] Found ${chatUrls.length} chats to import`);
    showProgress(0, chatUrls.length, `Found ${chatUrls.length} chats`);

    // Wait helper: poll until content script responds and messages are stable
    const waitForPageReady = async (maxWaitMs = 30000) => {
      const startTime = Date.now();
      let lastCount = 0;
      let stableCount = 0;

      while (Date.now() - startTime < maxWaitMs) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
          if (response?.pong) {
            const currentCount = response.messageCount || 0;

            // Check if message count is stable (same 3x in a row)
            if (currentCount === lastCount) {
              stableCount++;
              if (stableCount >= 3) {
                console.log('[Brain Shadow] Page ready - stable message count:', currentCount);
                return true;
              }
            } else {
              stableCount = 0;
              lastCount = currentCount;
            }
          }
        } catch (e) {
          // Page not ready yet
          stableCount = 0;
          lastCount = 0;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log('[Brain Shadow] Page ready timeout, proceeding anyway');
      return true;
    };

    // Use async IIFE to handle the loop properly
    (async () => {
      let savedCount = 0;

      for (let i = 0; i < chatUrls.length; i++) {
        let url = chatUrls[i];
        
        // --- A. URL Validation ---
        // Basic pattern check for Gemini / ChatGPT
        const isGeminiUrl = url.includes('gemini.google.com/app/');
        const isChatGptUrl = url.includes('chatgpt.com/c/') || url.includes('chat.openai.com/c/');

        if (!isGeminiUrl && !isChatGptUrl) {
          console.warn('[Brain Shadow] Skipping invalid or non-conversation URL:', url);
          continue;
        }

        // Strict Gemini validation as requested
        if (url.includes('gemini.google.com') && !/\/app\/[a-zA-Z0-9_\-]+/.test(url)) {
          console.warn('[Brain Shadow] Skipping restricted Gemini URL:', url);
          continue;
        }

        const title = url.split('/c/')[1]?.substring(0, 20)
          || url.split('/app/')[1]?.substring(0, 20)
          || `Chat ${i + 1}`;

        console.log(`[Brain Shadow] === Processing ${i + 1}/${chatUrls.length}: ${title} ===`);
        console.log(`[Brain Shadow] Next URL: ${url}`);
        showProgress(i, chatUrls.length, title);

        try {
          // Navigate to the chat
          await chrome.tabs.update(tab.id, { url });
          
          // --- D. Add Navigation Logging ---
          console.log('[Brain Shadow] Navigation initiated to:', url);

          // Wait for page to be fully ready and messages stable
          await waitForPageReady();
          
          // Get final URL after load
          const currentTab = await chrome.tabs.get(tab.id);
          console.log(`[Brain Shadow] Final URL after page load: ${currentTab.url}`);

          // Trigger capture via message (with retry)
          let captureResult = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              captureResult = await chrome.tabs.sendMessage(
                tab.id,
                { type: 'CAPTURE_CURRENT' }
              );
              console.log(
                '[Brain Shadow] Capture completed:',
                captureResult
              );
              if (
                captureResult?.status === 'saved' ||
                captureResult?.status === 'skipped' ||
                captureResult?.status === 'empty'
              ) {
                console.log(
                  `[Brain Shadow] Finished processing: ${captureResult?.title || 'Untitled'}`
                );
                break;
              }
            } catch (e) {
              console.log(
                '[Brain Shadow] Capture attempt',
                attempt + 1,
                'failed:',
                e.message || e
              );
            }
            await new Promise(r => setTimeout(r, 2000));
          }

          savedCount++;
        } catch (e) {
          console.error('[Brain Shadow] Error on chat', i, ':', e);
        }

        console.log('[Brain Shadow] Moving to next chat...');

        // --- F. Session Protection ---
        // Increased delay from 500ms to 1500ms to avoid triggering protections
        console.log('[Brain Shadow] Session Protection delay: 1500ms');
        await new Promise(r => setTimeout(r, 1500));

        // Refresh stats every 3 chats
        if (i % 3 === 0) {
          loadStats();
          loadRecentConversations();
        }
      }

      console.log('[Brain Shadow] Bulk import complete, saved:', savedCount);
      // sendBulkStatus('done', { count: savedCount, total: chatUrls.length });
      isBulkRunning = false;
      document.getElementById('btnBulkImport').disabled = false;
      document.getElementById('btnBulkImport').textContent = '⚡ Bulk Import All Past Chats';
      showToast(`Done! ${savedCount} chats saved`, 'success');

      loadStats();
      loadRecentConversations();
      setTimeout(hideProgress, 4000);
    })();
  });
});

// ── Capture Current ────────────────────────────────────────
document.getElementById('btnCaptureCurrent').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CURRENT' }, () => {
    setTimeout(async () => {
      await loadStats();
      await loadRecentConversations();
      showToast('Captured!', 'success');
    }, 800);
  });
});

// ── Export JSON ────────────────────────────────────────────
document.getElementById('btnExport').addEventListener('click', async () => {
  const data = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });

  if (!data.conversations || data.conversations.length === 0) {
    showToast('No data to export', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brain-shadow-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${data.conversations.length} conversations`, 'success');
});

// ── Clear Data ─────────────────────────────────────────────
document.getElementById('btnClear').addEventListener('click', async () => {
  if (!confirm('Delete all captured conversations? This cannot be undone.')) return;

  await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
  await loadStats();
  await loadRecentConversations();
  showToast('All data cleared');
});

// ── Save Backend URL ───────────────────────────────────────
document.getElementById('btnSaveUrl').addEventListener('click', async () => {
  const url = document.getElementById('backendUrl').value.trim();
  if (!url) return;

  await chrome.runtime.sendMessage({ type: 'SET_BACKEND_URL', url });
  showToast('Backend URL saved', 'success');
});

// ── Listen for bulk import progress from content script ────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'BULK_STATUS') return;

  if (message.status === 'found') {
    showProgress(0, message.total, `Found ${message.total} conversations`);
  }

  if (message.status === 'progress') {
    showProgress(message.count, message.total, message.currentTitle);
    // Refresh stats every 10 saves
    if (message.count % 10 === 0) {
      loadStats();
      loadRecentConversations();
    }
  }

  if (message.status === 'done') {
    isBulkRunning = false;
    document.getElementById('btnBulkImport').disabled = false;
    document.getElementById('btnBulkImport').textContent = '⚡ Bulk Import All Past Chats';
    showProgress(message.count, message.total, `Done! Saved ${message.count} conversations`);
    loadStats();
    loadRecentConversations();
    showToast(`Done! ${message.count} chats saved`, 'success');
    setTimeout(hideProgress, 4000);
  }
});

// ── Init ───────────────────────────────────────────────────
(async () => {
  await loadStats();
  await loadRecentConversations();
  await loadBackendUrl();
})();
