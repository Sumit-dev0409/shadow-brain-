// Brain Shadow — Background Service Worker (Grok)

const STORAGE_KEY     = 'brain_shadow_conversations';
const META_KEY        = 'brain_shadow_meta';
const BACKEND_URL_KEY = 'brain_shadow_backend_url';
const DEFAULT_BACKEND = 'http://localhost:8000';

async function saveConversation(data, source = 'realtime') {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const conversations = result[STORAGE_KEY] || {};
    const key = `${data.platform}_${data.external_id}`;
    const existing = conversations[key];
    if (source === 'bulk' && existing && existing.messages.length >= data.messages.length)
      return { status: 'skipped', reason: 'no_change' };
    conversations[key] = { ...data, saved_at: new Date().toISOString(), message_count: data.messages.length, source };
    await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
    await updateMeta(conversations);
    // Sync to backend immediately (fire and forget)
    syncToBackend(data).catch(err => {
      console.warn('[Brain Shadow] Backend sync failed (local save OK):', err.message);
    });
    console.log(`[Brain Shadow] ${source === 'realtime' ? '🔴 Live' : '📦 Bulk'} saved: ${data.title} (${data.messages.length} msgs)`);
    return { status: 'saved', key };
  } catch (err) { return { status: 'error', error: err.message }; }
}

async function updateMeta(conversations) {
  const allConvs = Object.values(conversations);
  const platforms = {}; let totalMessages = 0;
  allConvs.forEach(conv => {
    platforms[conv.platform] = (platforms[conv.platform] || 0) + 1;
    const count = conv.message_count ?? conv.messages?.length ?? 0;
    totalMessages += typeof count === 'number' ? count : 0;
  });
  const meta = { total_conversations: allConvs.length, total_messages: totalMessages, platforms, last_updated: new Date().toISOString() };
  await chrome.storage.local.set({ [META_KEY]: meta });
  chrome.action.setBadgeText({ text: allConvs.length > 0 ? String(allConvs.length) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#7c6aff' });
}

async function syncToBackend(data) {
  const result = await chrome.storage.local.get(BACKEND_URL_KEY);
  const backendUrl = result[BACKEND_URL_KEY] || DEFAULT_BACKEND;
  const response = await fetch(`${backendUrl}/api/import/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(`Backend error: ${response.status}`);
  return response.json();
}

async function getAllConversations() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return Object.values(result[STORAGE_KEY] || {}).sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
}

async function exportAllData() {
  const conversations = await getAllConversations();
  const meta = (await chrome.storage.local.get(META_KEY))[META_KEY] || {};
  return { exported_at: new Date().toISOString(), meta, conversations };
}

async function clearAllData() { await chrome.storage.local.remove([STORAGE_KEY, META_KEY]); return { status: 'cleared' }; }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_CONVERSATION' || message.type === 'CONVERSATION_CAPTURED') { saveConversation(message.payload, 'realtime').then(sendResponse); return true; }
  if (message.type === 'SAVE_CONVERSATION_BULK') { saveConversation(message.payload, 'bulk').then(sendResponse); return true; }
  if (message.type === 'GET_ALL_CONVERSATIONS') { getAllConversations().then(sendResponse); return true; }
  if (message.type === 'GET_META') {
    chrome.storage.local.get([META_KEY, STORAGE_KEY]).then(async result => {
      let meta = result[META_KEY];
      if (!meta && result[STORAGE_KEY] && Object.keys(result[STORAGE_KEY]).length > 0) {
        await updateMeta(result[STORAGE_KEY]);
        meta = (await chrome.storage.local.get(META_KEY))[META_KEY];
      }
      sendResponse(meta || { total_conversations: 0, total_messages: 0, platforms: {} });
    });
    return true;
  }
  if (message.type === 'EXPORT_DATA') { exportAllData().then(sendResponse); return true; }
  if (message.type === 'CLEAR_DATA') { clearAllData().then(sendResponse); return true; }
  if (message.type === 'SET_BACKEND_URL') { chrome.storage.local.set({ [BACKEND_URL_KEY]: message.url }).then(() => sendResponse({ status: 'saved' })); return true; }
  if (message.type === 'GET_BACKEND_URL') { chrome.storage.local.get(BACKEND_URL_KEY).then(r => sendResponse({ url: r[BACKEND_URL_KEY] || DEFAULT_BACKEND })); return true; }
  if (message.type === 'BULK_STATUS') { chrome.runtime.sendMessage(message).catch(() => {}); return false; }
});

console.log('[Brain Shadow] Grok background service worker started');
