// ============================================================
// Brain Shadow — Background Service Worker (FIXED)
//
// FIX 1: Added handler for 'CONVERSATION_CAPTURED' (old message type)
//         as an alias for 'SAVE_CONVERSATION' — for backwards compat.
// FIX 2: Real-time captures from content script ALWAYS overwrite
//         stored data (so fresh scrapes replace stale bulk imports).
//         Deduplication (skip if no change) only applies to bulk imports.
// FIX 3: Duplicate detection for bulk import — skip if external_id
//         already exists with same or more messages.
// ============================================================

const STORAGE_KEY = 'brain_shadow_conversations';
const META_KEY = 'brain_shadow_meta';
const BACKEND_URL_KEY = 'brain_shadow_backend_url';
const BACKEND_KEY_KEY = 'brain_shadow_api_key'; // Custom key for backend auth
const DEFAULT_BACKEND = 'http://localhost:8000';
const DEFAULT_API_KEY = 'brain-shadow-secret-key-123';

// ── Save conversation ──────────────────────────────────────
// source: 'realtime' (content script) | 'bulk' (manual import)
async function saveConversation(data, source = 'realtime') {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const conversations = result[STORAGE_KEY] || {};
    const key = `${data.platform}_${data.external_id}`;
    const existing = conversations[key];

    if (source === 'bulk') {
      // Bulk import: skip if we already have same or more messages
      if (existing && existing.messages.length >= data.messages.length) {
        return { status: 'skipped', reason: 'no_change' };
      }
    }
    // Realtime captures always overwrite — fresh scrape beats stale data

    conversations[key] = {
      ...data,
      saved_at: new Date().toISOString(),
      message_count: data.messages.length,
      source,
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
    await updateMeta(conversations);

    // Automatic Background Sync
    syncToBackend(data, source).catch(err => {
      console.error('[Brain Shadow] Initial sync failed, will be retried in background:', err);
    });

    console.log(`[Brain Shadow] ${source === 'realtime' ? '🔴 Live' : '📦 Bulk'} saved: ${data.title} (${data.messages.length} msgs)`);
    return { status: 'saved', key };

  } catch (err) {
    console.error('[Brain Shadow] Save failed:', err);
    return { status: 'error', error: err.message };
  }
}

// ── Update Metadata Stats ──────────────────────────────────
async function updateMeta(conversations) {
  const convArray = Object.values(conversations);
  const totalConvs = convArray.length;
  const totalMsgs = convArray.reduce((acc, c) => acc + (c.message_count || 0), 0);
  
  const platforms = {};
  convArray.forEach(c => {
    const p = (c.platform || 'unknown').toLowerCase();
    platforms[p] = (platforms[p] || 0) + 1;
  });

  const meta = {
    total_conversations: totalConvs,
    total_messages: totalMsgs,
    platforms,
    last_updated: new Date().toISOString()
  };

  await chrome.storage.local.set({ [META_KEY]: meta });
  console.log('[Brain Shadow] Meta updated:', meta);
  return meta;
}

// ── Sync to Automated Backend ─────────────────────────────
async function syncToBackend(data, source = 'realtime', attempt = 1) {
  const result = await chrome.storage.local.get([BACKEND_URL_KEY, BACKEND_KEY_KEY]);
  const backendUrl = result[BACKEND_URL_KEY] || DEFAULT_BACKEND;
  const apiKey = result[BACKEND_KEY_KEY] || DEFAULT_API_KEY;

  const endpoint = source === 'bulk' ? '/api/conversations/bulk' : '/api/conversations';
  const url = `${backendUrl}${endpoint}`;
  const body = source === 'bulk' ? { conversations: [data] } : data;

  console.log(`[Brain Shadow DEBUG] Attempt ${attempt}: Syncing to: ${url}`);
  console.log(`[Brain Shadow DEBUG] API Key: ${apiKey ? 'PRESENT' : 'MISSING'}`);
  console.log(`[Brain Shadow DEBUG] Payload Title: ${data.title}, Messages: ${data.messages?.length}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify(body)
    });

    console.log(`[Brain Shadow DEBUG] Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Brain Shadow DEBUG] Backend Error: ${errorText}`);
      throw new Error(`Backend error (${response.status}): ${errorText}`);
    }

    const responseData = await response.json();
    console.log(`[Brain Shadow DEBUG] Sync successful:`, responseData);
    return responseData;
  } catch (err) {
    console.error(`[Brain Shadow DEBUG] Sync attempt ${attempt} failed:`, err.message);

    // Simple retry logic (up to 3 times with 5s delay)
    if (attempt < 3) {
      console.log(`[Brain Shadow] Retrying sync in 5s...`);
      setTimeout(() => syncToBackend(data, source, attempt + 1), 5000);
    }
    throw err;
  }
}

// ── Get all saved conversations ────────────────────────────
async function getAllConversations() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const conversations = result[STORAGE_KEY] || {};
  return Object.values(conversations).sort(
    (a, b) => new Date(b.saved_at) - new Date(a.saved_at)
  );
}

// ── Export all data as JSON ────────────────────────────────
async function exportAllData() {
  const conversations = await getAllConversations();
  const meta = (await chrome.storage.local.get(META_KEY))[META_KEY] || {};
  return { exported_at: new Date().toISOString(), meta, conversations };
}

// ── Clear all data ─────────────────────────────────────────
async function clearAllData() {
  await chrome.storage.local.remove([STORAGE_KEY, META_KEY]);
  return { status: 'cleared' };
}

// ── Message handler ────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ✅ FIX: Realtime capture from content script (always overwrite)
  if (message.type === 'SAVE_CONVERSATION' || message.type === 'CONVERSATION_CAPTURED') {
    saveConversation(message.payload, 'realtime').then(sendResponse);
    return true;
  }

  // Bulk import (dedup applies)
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
    chrome.runtime.sendMessage(message).catch(() => { });
    return false;
  }
});

// ── Navigation Guard & Logging (Gemini Protection) ────────
const INVALID_GEMINI_PATTERNS = [
  'signout',
  'logout',
  'accounts.google.com',
  'myaccount.google.com',
  '/settings/',
  '/help/'
];

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only process top-level frames
  if (details.frameId !== 0) return;

  const url = details.url;
  const isGemini = url.includes('gemini.google.com');
  const isInvalid = INVALID_GEMINI_PATTERNS.some(p => url.includes(p));

  // Log all navigations for debugging
  console.log(`[Brain Shadow Navigation] → ${url}`);

  if (isGemini && isInvalid) {
    console.warn(`[Brain Shadow] 🛑 BLOCKING REDIRECT: ${url}`);
    // Unfortunately we can't easily 'cancel' navigation in v3 without 'declarativeNetRequest'
    // but we can at least log it and potentially redirect back or close the tab if we knew it was a bulk tab.
    // For now, we log and the popup logic will handle the timeout/failure.
  }
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) {
    console.log(`[Brain Shadow Navigation] ✅ LOADED: ${details.url}`);
  }
});

console.log('[Brain Shadow] Background service worker started');
