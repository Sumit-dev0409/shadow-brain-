// ============================================================
// Brain Shadow – Background Service Worker (Claude.ai)
//
// Merges the Brain Shadow storage/sync layer (from ChatGPT extension)
// with the Claude-specific scrape loop that uses a background tab.
// ============================================================

// ── Brain Shadow storage keys ────────────────────────────────
const STORAGE_KEY     = 'brain_shadow_conversations';
const META_KEY        = 'brain_shadow_meta';
const BACKEND_URL_KEY = 'brain_shadow_backend_url';
const DEFAULT_BACKEND = 'http://localhost:8000';

// ── Scrape-loop state ────────────────────────────────────────
let scrapeTabId = null;

// ── Helpers ──────────────────────────────────────────────────
function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 4000);
  });
}

function extractClaudeId(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const idx   = parts.findIndex(p => p === 'chat' || p === 'c' || p === 'conversation');
    return idx !== -1 ? parts[idx + 1] : parts[parts.length - 1];
  } catch {
    return url;
  }
}

// ── Brain Shadow: Save conversation ─────────────────────────
// source: 'realtime' (content script) | 'bulk' (scrape loop)
async function saveConversation(data, source = 'realtime') {
  try {
    const result        = await chrome.storage.local.get(STORAGE_KEY);
    const conversations = result[STORAGE_KEY] || {};
    const key           = `${data.platform}_${data.external_id}`;
    const existing      = conversations[key];

    if (source === 'bulk') {
      // Skip if we already have same or more messages
      if (existing && existing.messages.length >= data.messages.length) {
        return { status: 'skipped', reason: 'no_change' };
      }
    }
    // Realtime always overwrites — fresh scrape beats stale data

    conversations[key] = {
      ...data,
      saved_at:      new Date().toISOString(),
      message_count: data.messages.length,
      source,
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
    await updateMeta(conversations);
    syncToBackend(data).catch(() => {});

    const tag = source === 'realtime' ? '🔴 Live' : '📦 Bulk';
    console.log(`[Brain Shadow] ${tag} saved: ${data.title} (${data.messages.length} msgs)`);
    return { status: 'saved', key };

  } catch (err) {
    console.error('[Brain Shadow] Save failed:', err);
    return { status: 'error', error: err.message };
  }
}

// ── Brain Shadow: Update stats ───────────────────────────────
async function updateMeta(conversations) {
  const allConvs    = Object.values(conversations);
  const platforms   = {};
  let totalMessages = 0;

  allConvs.forEach(conv => {
    platforms[conv.platform] = (platforms[conv.platform] || 0) + 1;
    totalMessages += conv.message_count || 0;
  });

  await chrome.storage.local.set({
    [META_KEY]: {
      total_conversations: allConvs.length,
      total_messages:      totalMessages,
      platforms,
      last_updated:        new Date().toISOString(),
    }
  });
}

// ── Brain Shadow: Sync to FastAPI backend ────────────────────
async function syncToBackend(data) {
  const result     = await chrome.storage.local.get(BACKEND_URL_KEY);
  const backendUrl = result[BACKEND_URL_KEY] || DEFAULT_BACKEND;

  const response = await fetch(`${backendUrl}/api/import/capture`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });

  if (!response.ok) throw new Error(`Backend error: ${response.status}`);
  return response.json();
}

// ── Brain Shadow: Query storage ───────────────────────────────
async function getAllConversations() {
  const result        = await chrome.storage.local.get(STORAGE_KEY);
  const conversations = result[STORAGE_KEY] || {};
  return Object.values(conversations).sort(
    (a, b) => new Date(b.saved_at) - new Date(a.saved_at)
  );
}

async function exportAllData() {
  const conversations = await getAllConversations();
  const meta          = (await chrome.storage.local.get(META_KEY))[META_KEY] || {};
  return { exported_at: new Date().toISOString(), meta, conversations };
}

async function clearAllData() {
  await chrome.storage.local.remove([STORAGE_KEY, META_KEY]);
  return { status: 'cleared' };
}

// ── Download JSON ────────────────────────────────────────────
function downloadResults(data, filename) {
  const jsonString = JSON.stringify(data, null, 2);
  const notify     = msg => chrome.runtime.sendMessage({ action: 'downloadStatus', message: msg }).catch(() => {});

  chrome.downloads.download(
    {
      url:            `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`,
      filename,
      saveAs:         false,
      conflictAction: 'uniquify',
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[Brain Shadow] Download error:', chrome.runtime.lastError.message);
        notify(`Download failed: ${chrome.runtime.lastError.message}`);
        return;
      }
      notify(`Download started: ${filename}`);
    }
  );
}

// ── Get or create background scrape tab ──────────────────────
async function getScrapeTab() {
  if (scrapeTabId) {
    const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    if (tabs.find(t => t.id === scrapeTabId)) return scrapeTabId;
  }
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  scrapeTabId = tab.id;
  return tab.id;
}

// ── Navigate background tab and extract one conversation ─────
async function updateTabAndScrape(thread) {
  const tabId = await getScrapeTab();

  try {
    await chrome.tabs.update(tabId, { url: thread.url });
  } catch {
    return null;
  }

  await waitForTabComplete(tabId);
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['fetch.js'] });
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      resolve(null);
    }, 10000);

    const listener = (message, sender) => {
      if (
        message.action === 'conversationExtracted' &&
        sender.tab &&
        sender.tab.id === tabId
      ) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message.data);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    chrome.tabs.sendMessage(tabId, { action: 'extractConversation' });
  });
}

// ── Full bulk scrape loop ────────────────────────────────────
async function scrapeAll(threadsList) {
  let totalNewMessages = 0;
  const scrapedConvs   = [];

  for (let i = 0; i < threadsList.length; i++) {
    const thread     = threadsList[i];
    const percentage = Math.round(((i + 1) / threadsList.length) * 100);

    // Update badge
    chrome.action.setBadgeText({ text: percentage + '%' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

    const progressPayload = {
      action:     'scrapeProgress',
      current:    i + 1,
      total:      threadsList.length,
      title:      thread.title,
      percentage,
      messages:   0,
    };

    // Notify overlay on any open claude.ai tabs
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.url && tab.url.includes('claude.ai')) {
        chrome.tabs.sendMessage(tab.id, progressPayload).catch(() => {});
      }
    }
    chrome.runtime.sendMessage(progressPayload).catch(() => {});

    const conversationData = await updateTabAndScrape(thread);

    if (conversationData) {
      const messages = Array.isArray(conversationData.newMessages)
        ? conversationData.newMessages
        : [];
      const newCount = conversationData.newCount || messages.length;
      totalNewMessages += newCount;

      // ── Brain Shadow: persist in structured storage ──────
      if (messages.length > 0) {
        const external_id = extractClaudeId(thread.url);
        await saveConversation(
          {
            platform:    'claude',
            external_id,
            title:       thread.title,
            url:         thread.url,
            messages,
          },
          'bulk'
        );
      }

      scrapedConvs.push({
        thread,
        conversation:       conversationData,
        newMessagesCount:   newCount,
        totalMessagesCount: conversationData.total || messages.length,
        extractedAt:        new Date().toISOString(),
      });

      // Update progress with message count
      const updated = { ...progressPayload, messages: newCount };
      for (const tab of allTabs) {
        if (tab.url && tab.url.includes('claude.ai')) {
          chrome.tabs.sendMessage(tab.id, updated).catch(() => {});
        }
      }
      chrome.runtime.sendMessage(updated).catch(() => {});
    }
  }

  // Close background tab
  if (scrapeTabId) {
    chrome.tabs.remove(scrapeTabId).catch(() => {});
    scrapeTabId = null;
  }

  chrome.action.setBadgeText({ text: 'Done' });
  chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });

  // Notify overlays that scrape is done
  const finalTabs = await chrome.tabs.query({});
  for (const tab of finalTabs) {
    if (tab.url && tab.url.includes('claude.ai')) {
      chrome.tabs.sendMessage(tab.id, { action: 'scrapeDone' }).catch(() => {});
    }
  }

  // Download Brain Shadow export (all stored conversations, not just this batch)
  const exportData = await exportAllData();
  const filename   = `brain_shadow_claude_${new Date().toISOString().slice(0, 10)}.json`;
  downloadResults(exportData, filename);

  return scrapedConvs;
}

// ── Message handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Bulk scrape triggered from popup
  if (message.action === 'scrapeAllConversations') {
    scrapeAll(message.threads)
      .then(result => sendResponse({ conversations: result }))
      .catch(err => {
        console.error('[Brain Shadow] scrapeAll error:', err);
        sendResponse({ conversations: [] });
      });
    return true;
  }

  // Realtime capture from content script (action style, always overwrite)
  if (message.action === 'conversationExtracted' && message.data && sender.tab) {
    const d           = message.data;
    const url         = sender.tab.url || '';
    const title       = sender.tab.title || extractClaudeId(url);
    const external_id = extractClaudeId(url);
    const messages    = Array.isArray(d.newMessages) ? d.newMessages : [];

    if (messages.length > 0) {
      saveConversation({ platform: 'claude', external_id, title, url, messages }, 'realtime')
        .catch(() => {});
    }
    return false;
  }

  // ── Brain Shadow message types (SAVE / query / export / etc.) ──

  if (message.type === 'SAVE_CONVERSATION' || message.type === 'CONVERSATION_CAPTURED') {
    saveConversation(message.payload, 'realtime').then(sendResponse);
    return true;
  }

  if (message.type === 'SAVE_CONVERSATION_BULK') {
    saveConversation(message.payload, 'bulk').then(sendResponse);
    return true;
  }

  if (message.type === 'GET_ALL_CONVERSATIONS') {
    getAllConversations().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_META') {
    chrome.storage.local.get(META_KEY).then(result => {
      sendResponse(result[META_KEY] || { total_conversations: 0, total_messages: 0, platforms: {} });
    });
    return true;
  }

  if (message.type === 'EXPORT_DATA') {
    exportAllData().then(sendResponse);
    return true;
  }

  if (message.type === 'CLEAR_DATA') {
    clearAllData().then(sendResponse);
    return true;
  }

  if (message.type === 'SET_BACKEND_URL') {
    chrome.storage.local.set({ [BACKEND_URL_KEY]: message.url }).then(() => {
      sendResponse({ status: 'saved' });
    });
    return true;
  }

  if (message.type === 'GET_BACKEND_URL') {
    chrome.storage.local.get(BACKEND_URL_KEY).then(result => {
      sendResponse({ url: result[BACKEND_URL_KEY] || DEFAULT_BACKEND });
    });
    return true;
  }

  if (message.type === 'BULK_STATUS') {
    chrome.runtime.sendMessage(message).catch(() => {});
    return false;
  }
});

console.log('[Brain Shadow] Background service worker started (Claude.ai)');
