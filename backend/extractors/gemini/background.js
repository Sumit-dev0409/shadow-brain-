// ============================================================
// Brain Shadow — Background Service Worker (Gemini)
// ============================================================

const PLATFORM       = 'gemini';
const STORAGE_KEY    = 'brain_shadow_conversations';
const META_KEY       = 'brain_shadow_meta';
const BACKEND_URL_KEY = 'brain_shadow_backend_url';
const DEFAULT_BACKEND = 'http://localhost:8000';

let scrapeTabId = null;

// ── Wait for a tab to finish loading ──────────────────────
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
    setTimeout(resolve, 5000); // fallback
  });
}

function extractGeminiId(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const idx = parts.findIndex(p => p === 'app');
    return idx !== -1 && parts[idx + 1] ? parts[idx + 1] : parts[parts.length - 1];
  } catch {
    return url;
  }
}

// ── Persist conversation in Brain Shadow storage ──────────
async function saveConversation(data, source = 'realtime') {
  try {
    const result        = await chrome.storage.local.get(STORAGE_KEY);
    const conversations = result[STORAGE_KEY] || {};
    const key           = `${data.platform}_${data.external_id}`;
    const existing      = conversations[key];

    if (source === 'bulk' && existing && existing.messages.length >= data.messages.length) {
      return { status: 'skipped', reason: 'no_change' };
    }

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

function downloadResults(data, filename) {
  const json    = JSON.stringify(data, null, 2);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;

  chrome.downloads.download({ url: dataUrl, filename, saveAs: false, conflictAction: 'uniquify' }, () => {
    chrome.runtime.sendMessage({ action: 'downloadStatus', message: `Downloaded: ${filename}` }).catch(() => {});
  });
}

// ── Open/reuse a background tab for scraping ─────────────
async function getScrapeTab() {
  if (scrapeTabId) {
    const tabs = await chrome.tabs.query({});
    if (tabs.find(t => t.id === scrapeTabId)) return scrapeTabId;
  }
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  scrapeTabId = tab.id;
  return tab.id;
}

// ── Navigate background tab and scrape one conversation ───
async function scrapeOneConversation(thread) {
  const tabId = await getScrapeTab();

  try {
    await chrome.tabs.update(tabId, { url: thread.url });
  } catch {
    return null;
  }

  await waitForTabComplete(tabId);
  await new Promise(r => setTimeout(r, 1800));

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['fetch.js'] });
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      resolve(null);
    }, 12000);

    const listener = (message, sender) => {
      if (message.action === 'conversationExtracted' && sender.tab?.id === tabId) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message.data);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    chrome.tabs.sendMessage(tabId, { action: 'extractConversation' });
  });
}

// ── Full bulk scrape loop ──────────────────────────────────
async function scrapeAll(threadsList) {
  let totalNewMessages = 0;
  const scrapedConvs   = [];

  for (let i = 0; i < threadsList.length; i++) {
    const thread     = threadsList[i];
    const percentage = Math.round(((i + 1) / threadsList.length) * 100);

    chrome.action.setBadgeText({ text: percentage + '%' });
    chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });

    const progress = { action: 'scrapeProgress', current: i + 1, total: threadsList.length, title: thread.title, percentage, messages: 0 };

    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.url?.includes('gemini.google.com')) {
        chrome.tabs.sendMessage(tab.id, progress).catch(() => {});
      }
    }
    chrome.runtime.sendMessage(progress).catch(() => {});

    const data = await scrapeOneConversation(thread);

    if (data) {
      const messages = Array.isArray(data.newMessages) ? data.newMessages : [];
      const newCount = data.newCount || messages.length;
      totalNewMessages += newCount;

      if (messages.length > 0) {
        const external_id = extractGeminiId(thread.url);
        await saveConversation(
          { platform: PLATFORM, external_id, title: thread.title, url: thread.url, messages },
          'bulk'
        );
      }

      scrapedConvs.push({
        thread,
        conversation:       data,
        newMessagesCount:   newCount,
        totalMessagesCount: data.total || messages.length,
        extractedAt:        new Date().toISOString(),
      });

      const updated = { ...progress, messages: newCount };
      for (const tab of allTabs) {
        if (tab.url?.includes('gemini.google.com')) {
          chrome.tabs.sendMessage(tab.id, updated).catch(() => {});
        }
      }
      chrome.runtime.sendMessage(updated).catch(() => {});
    }
  }

  if (scrapeTabId) {
    chrome.tabs.remove(scrapeTabId).catch(() => {});
    scrapeTabId = null;
  }

  chrome.action.setBadgeText({ text: 'Done' });
  chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });

  const finalTabs = await chrome.tabs.query({});
  for (const tab of finalTabs) {
    if (tab.url?.includes('gemini.google.com')) {
      chrome.tabs.sendMessage(tab.id, { action: 'scrapeDone' }).catch(() => {});
    }
  }

  const exportData = await exportAllData();
  const filename   = `brain_shadow_gemini_${new Date().toISOString().slice(0, 10)}.json`;
  downloadResults(exportData, filename);

  return scrapedConvs;
}

// ── Message handler ────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'scrapeAllConversations') {
    scrapeAll(message.threads)
      .then(r => sendResponse({ conversations: r }))
      .catch(err => { console.error('[Brain Shadow]', err); sendResponse({ conversations: [] }); });
    return true;
  }

  if (message.action === 'conversationExtracted' && message.data && sender.tab) {
    const d           = message.data;
    const url         = sender.tab.url || '';
    const title       = sender.tab.title?.replace(' - Gemini', '').trim() || extractGeminiId(url);
    const external_id = extractGeminiId(url);
    const messages    = Array.isArray(d.newMessages) ? d.newMessages : [];

    if (messages.length > 0) {
      saveConversation({ platform: PLATFORM, external_id, title, url, messages }, 'realtime').catch(() => {});
    }
    return false;
  }

  if (message.type === 'SAVE_CONVERSATION' || message.type === 'CONVERSATION_CAPTURED') {
    saveConversation(message.payload, 'realtime').then(sendResponse);
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
    chrome.storage.local.set({ [BACKEND_URL_KEY]: message.url }).then(() => sendResponse({ status: 'saved' }));
    return true;
  }
  if (message.type === 'GET_BACKEND_URL') {
    chrome.storage.local.get(BACKEND_URL_KEY).then(result => {
      sendResponse({ url: result[BACKEND_URL_KEY] || DEFAULT_BACKEND });
    });
    return true;
  }
});

console.log('[Brain Shadow] Gemini background service worker started');
