// ============================================================
// Brain Shadow — Universal Background Service Worker
//
// Concurrent multi-platform scraping:
//   Each platform runs in its own hidden tab independently.
//   Starting a scrape on Platform B while Platform A is running
//   is fully supported — they don't block each other.
//
// Progress stored per-platform under PROGRESS_KEY:
//   { sessions: { gemini: {...}, deepseek: {...} }, totalSaved: N }
// ============================================================

const STORAGE_KEY  = 'brain_shadow_conversations';
const META_KEY     = 'brain_shadow_meta';
const BACKEND_KEY  = 'brain_shadow_backend_url';
const PROGRESS_KEY = 'brain_shadow_scrape_progress';
const DEFAULT_BACKEND = 'http://localhost:8000';

// ── Keep service worker alive during scraping ──────────────
let keepAliveTimer = null;
let activeSessions = 0;  // how many platform scrapes are running

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => chrome.storage.local.get('_ka').then(() => {}), 20000);
}
function stopKeepAlive() {
  if (activeSessions > 0) return; // only stop when all sessions done
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}

// ── Progress helpers ───────────────────────────────────────
async function getProgress() {
  return (await chrome.storage.local.get(PROGRESS_KEY))[PROGRESS_KEY] || { sessions: {}, totalSaved: 0, totalSynced: 0 };
}

async function setSessionProgress(platform, update) {
  const prog = await getProgress();
  await chrome.storage.local.set({
    [PROGRESS_KEY]: {
      ...prog,
      sessions: {
        ...(prog.sessions || {}),
        [platform]: { ...(prog.sessions?.[platform] || {}), ...update },
      },
    },
  });
}

async function addToTotals(saved, synced) {
  const prog = await getProgress();
  await chrome.storage.local.set({
    [PROGRESS_KEY]: {
      ...prog,
      totalSaved:  (prog.totalSaved  || 0) + saved,
      totalSynced: (prog.totalSynced || 0) + synced,
    },
  });
}

// ── Tab helpers ────────────────────────────────────────────
function waitForTabLoad(tabId, extraMs = 2000) {
  return new Promise((resolve) => {
    const onUpdate = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdate);
      setTimeout(resolve, extraMs);
    };
    chrome.tabs.onUpdated.addListener(onUpdate);
    setTimeout(resolve, 12000);
  });
}

async function navigateTab(tabId, url, extraMs = 1500) {
  chrome.tabs.update(tabId, { url });
  await waitForTabLoad(tabId, extraMs);
}

async function waitForContentScript(tabId, maxMs = 20000) {
  const start = Date.now(); let lastCount = -1, stable = 0, zeroStable = 0;
  while (Date.now() - start < maxMs) {
    try {
      const r = await tabMessage(tabId, { type: 'PING' });
      if (r?.pong) {
        const n = r.messageCount || 0;
        if (n > 0 && n === lastCount) { stable++; if (stable >= 3) return; }
        else if (n === 0) { zeroStable++; if (zeroStable >= 5) return; lastCount = n; }
        else { stable = 0; zeroStable = 0; lastCount = n; }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
}

function tabMessage(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (r) => resolve(chrome.runtime.lastError ? null : r));
  });
}

// Wait until the content script's message listener is registered (responds to PING)
async function waitForContentScriptReady(tabId, maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await tabMessage(tabId, { type: 'PING' });
    if (r?.pong) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// ══════════════════════════════════════════════════════════
// SCRAPE ONE PLATFORM — fully independent, own hidden tab
// ══════════════════════════════════════════════════════════
async function scrapePlatform(platform, baseUrl) {
  activeSessions++;
  startKeepAlive();

  await setSessionProgress(platform, {
    running: true, done: false, stopRequested: false,
    current: 0, total: 0, pct: 0, savedCount: 0, syncedCount: 0,
    title: 'Opening background tab…', startedAt: new Date().toISOString(),
  });

  // Update badge to show number of active sessions
  chrome.action.setBadgeText({ text: String(activeSessions) });
  chrome.action.setBadgeBackgroundColor({ color: '#7c6aff' });

  let tabId = null;
  try {
    // Open hidden tab — user's current page is NOT touched
    console.log(`[${platform}] Opening hidden tab: ${baseUrl}`);
    const tab = await new Promise(resolve => chrome.tabs.create({ url: baseUrl, active: false }, resolve));
    tabId = tab.id;
    await waitForTabLoad(tabId, 2500);
    console.log(`[${platform}] Tab loaded (id=${tabId})`);

    await setSessionProgress(platform, { title: 'Reading sidebar…' });

    // Tell the content script to suppress auto-capture during scrape mode
    try { await tabMessage(tabId, { type: 'SET_SCRAPE_MODE', enabled: true }); } catch {}

    // Wait until content script is ready before reading sidebar
    const ready = await waitForContentScriptReady(tabId);
    if (!ready) {
      console.warn(`[${platform}] Content script did not respond to PING after ${15}s — aborting`);
      await setSessionProgress(platform, { running: false, done: true, title: 'Content script not ready' });
      return;
    }

    console.log(`[${platform}] Sending GET_SIDEBAR_CHATS...`);
    const threads = await tabMessage(tabId, { type: 'GET_SIDEBAR_CHATS' }) || [];
    console.log(`[${platform}] GET_SIDEBAR_CHATS returned ${threads.length} threads`);

    if (!threads.length) {
      console.warn(`[${platform}] No conversations found in sidebar — scraping cannot proceed`);
      console.warn(`[${platform}] Possible cause: Gemini DOM changed and extractRecents() cannot find <a> tags`);
      await setSessionProgress(platform, { running: false, done: true, pct: 100, title: 'No conversations found — DOM may have changed' });
      return;
    }

    // Filter already-captured conversations
    const existing = await getAllConversations();
    console.log(`[${platform}] Existing conversations in storage: ${existing.length}`);
    const capturedPaths = new Set(existing.map(c => { try { return new URL(c.url).pathname; } catch { return c.url; } }));
    console.log(`[${platform}] Captured pathnames: ${[...capturedPaths].join(', ') || 'none'}`);
    const newThreads   = threads.filter(t => { try { return !capturedPaths.has(new URL(t.url).pathname); } catch { return true; } });
    const skipped      = threads.length - newThreads.length;
    console.log(`[${platform}] After dedup: ${newThreads.length} new, ${skipped} already captured`);

    if (!newThreads.length) {
      await setSessionProgress(platform, { running: false, done: true, pct: 100, skipped, title: `All ${threads.length} already captured` });
      return;
    }
  await setSessionProgress(platform, {
    total: newThreads.length, skipped, title: `Found ${newThreads.length} new chats` });

    let savedCount = 0, syncedCount = 0, duplicateCount = 0, failedCount = 0, skippedCount = 0, emptyCount = 0;

    for (let i = 0; i < newThreads.length; i++) {
      // Check this session's stop flag (not global — each session has its own)
      const prog = await getProgress();
      if (prog.sessions?.[platform]?.stopRequested) break;

      const { url, title } = newThreads[i];
      const pct = Math.round(((i + 1) / newThreads.length) * 100);

      await setSessionProgress(platform, { current: i + 1, pct, title, savedCount, duplicateCount, failedCount, skippedCount, emptyCount });
      chrome.action.setBadgeText({ text: `${pct}%` });

      console.log(`[${platform}] Moving to next conversation (${i+1}/${newThreads.length}): "${title}"`);

      try {
        console.log(`[${platform}] Navigating to: ${url}`);
        await navigateTab(tabId, url, 1500);
        // Re-enable scrape mode on the NEW content script instance (navigating re-injects it)
        try { await tabMessage(tabId, { type: 'SET_SCRAPE_MODE', enabled: true }); } catch {}
        console.log(`[${platform}] Waiting for content script...`);
        await waitForContentScript(tabId);
        console.log(`[${platform}] Content script ready`);

        let captureResult = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          console.log(`[${platform}] Capture attempt ${attempt+1}/3 for: "${title}"`);
          captureResult = await tabMessage(tabId, { type: 'CAPTURE_CURRENT' });
          console.log(`[${platform}] CAPTURE_CURRENT returned: ${JSON.stringify(captureResult)}`);
          if (captureResult?.status === 'saved' || captureResult?.status === 'skipped' || captureResult?.status === 'empty') break;
          await new Promise(r => setTimeout(r, 2000));
        }

        const status = captureResult?.status || 'unknown';
        const reason = captureResult?.reason || '';
        console.log(`[${platform}] Final status: ${status}, reason: ${reason || 'none'}`);

        if (status === 'saved') {
          savedCount++;
          if (captureResult?.synced) syncedCount++;
          await addToTotals(1, captureResult?.synced ? 1 : 0);
          console.log(`[${platform}] Conversation saved: "${title}" | chatCount=${savedCount} | msgCount=${captureResult?.message_count || 0} | synced=${!!captureResult?.synced}`);
        } else if (status === 'skipped' && reason === 'duplicate') {
          // Auto-capture (from waitForChatAndObserve 3.5s timeout) saved it first
          duplicateCount++;
          savedCount++;
          console.log(`[${platform}] Duplicate (auto-captured): "${title}" | chatCount=${savedCount} | msgCount=${captureResult?.message_count || 0}`);
        } else if (status === 'skipped') {
          skippedCount++;
          console.log(`[${platform}] Skipped: "${title}" — ${reason || 'no reason'}`);
        } else if (status === 'empty') {
          emptyCount++;
          console.log(`[${platform}] Empty: "${title}" — no messages found on page (DOM selectors may not match)`);
        } else {
          failedCount++;
          console.warn(`[${platform}] Capture failed for "${title}": ${status}${reason ? ' ('+reason+')' : ''}`);
        }

        console.log(`[${platform}] Chat count updated: ${savedCount} saved · ${duplicateCount} duplicates · ${emptyCount} empty · ${failedCount} failed`);

      } catch (e) {
        failedCount++;
        console.error(`[${platform}] Error: ${e.message}`);
      }

      await new Promise(r => setTimeout(r, 150));
    }

    await setSessionProgress(platform, {
      running: false, done: true, pct: 100, savedCount, syncedCount, duplicateCount, failedCount, skippedCount, emptyCount,
      title: `Done — ${savedCount} saved · ${syncedCount} synced · ${duplicateCount} duplicates · ${emptyCount} empty · ${failedCount} failed`,
    });

    console.log(`[${platform}] Scraping finished: ${savedCount} saved · ${syncedCount} synced · ${duplicateCount} duplicates · ${emptyCount} empty · ${failedCount} failed`);

  } catch (err) {
    console.error(`[${platform}] Scrape failed:`, err.message);
    await setSessionProgress(platform, { running: false, done: true, title: `Error: ${err.message}` });
  } finally {
    // Turn off scrape mode so auto-capture resumes for normal browsing
    if (tabId) { try { await tabMessage(tabId, { type: 'SET_SCRAPE_MODE', enabled: false }); } catch {} }
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
    activeSessions = Math.max(0, activeSessions - 1);
    stopKeepAlive();

    // Update badge
    if (activeSessions === 0) {
      chrome.action.setBadgeText({ text: 'Done' });
      chrome.action.setBadgeBackgroundColor({ color: '#34d399' });

      // Notification when all sessions complete
      const prog = await getProgress();
      chrome.notifications.create(`bs_done_${Date.now()}`, {
        type:    'basic',
        iconUrl: 'icons/icon48.png',
        title:   'Brain Shadow — Import Complete',
        message: `${prog.totalSaved || 0} chats saved · ${prog.totalSynced || 0} synced to MongoDB`,
      });
    } else {
      chrome.action.setBadgeText({ text: String(activeSessions) });
    }
  }
}

// ── Save conversation ──────────────────────────────────────
async function saveConversation(data, source = 'realtime') {
  try {
    const platform      = data.platform || 'unknown';
    const external_id   = data.external_id || '';
    const messageCount  = data.messages?.length || 0;
    const result        = await chrome.storage.local.get(STORAGE_KEY);
    const conversations = result[STORAGE_KEY] || {};
    const key           = `${platform}_${external_id}`;
    const existing      = conversations[key];

    console.log(`[${platform}] saveConversation: ID=${external_id} messages=${messageCount} source=${source} key=${key}`);

    // Duplicate detection: if exact key already exists, skip
    if (existing) {
      console.log(`[${platform}] Duplicate detected — "${data.title}" (ID: ${external_id}) already exists with ${existing.messages?.length || 0} messages`);
      return { status: 'skipped', reason: 'duplicate', key };
    }

    conversations[key] = { ...data, saved_at: new Date().toISOString(), message_count: messageCount, source, synced: false };
    await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
    console.log(`[${platform}] About to updateMeta — totalKeys=${Object.keys(conversations).length}`);
    await updateMeta(conversations);
    console.log(`[${platform}] Conversation saved: "${data.title}" (ID: ${external_id}, messages: ${messageCount})`);
    console.log(`[${platform}] Chat count updated: ${Object.keys(conversations).length} total`);
    console.log(`[${platform}] Message count updated: ${messageCount} messages in this conversation`);
    console.log(`[${platform}] Platform count updated`);

    // Sync to backend immediately (fire and forget — local save already succeeded)
    const syncResult = await syncToBackend(data);
    if (syncResult.ok) {
      conversations[key].synced = true;
      await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
    }

    console.log(`[${platform}] Save result: saved | synced: ${syncResult.ok}`);
    return { status: 'saved', key, synced: syncResult.ok };
  } catch (err) {
    console.error(`[${data?.platform || 'unknown'}] Save error: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

async function syncToBackend(data) {
  try {
    const r          = await chrome.storage.local.get(BACKEND_KEY);
    const backendUrl = (r[BACKEND_KEY] || DEFAULT_BACKEND).replace(/\/$/, '');
    const response   = await fetch(`${backendUrl}/api/import/capture`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function testBackend(backendUrl) {
  try {
    const url = (backendUrl || DEFAULT_BACKEND).replace(/\/$/, '');
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function updateMeta(conversations) {
  const allConvs = Object.values(conversations);
  const platforms = {}; let totalMessages = 0;
  allConvs.forEach(conv => {
    platforms[conv.platform] = (platforms[conv.platform] || 0) + 1;
    totalMessages += conv.message_count || 0;
  });
  console.log(`[updateMeta] platforms=${JSON.stringify(platforms)} totalConvs=${allConvs.length} totalMsgs=${totalMessages}`);
  await chrome.storage.local.set({
    [META_KEY]: { total_conversations: allConvs.length, total_messages: totalMessages, platforms, last_updated: new Date().toISOString() },
  });
}

async function getAllConversations() {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  return Object.values(r[STORAGE_KEY] || {}).sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
}

async function exportAllData() {
  const conversations = await getAllConversations();
  const meta = (await chrome.storage.local.get(META_KEY))[META_KEY] || {};
  return { exported_at: new Date().toISOString(), meta, conversations };
}

async function clearAllData() {
  await chrome.storage.local.remove([STORAGE_KEY, META_KEY, PROGRESS_KEY]);
  return { status: 'cleared' };
}

// ── Message handler ────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Start scraping one platform (concurrent — doesn't block other platforms)
  if (message.type === 'START_PLATFORM_IMPORT') {
    const { platform, baseUrl } = message;
    getProgress().then(prog => {
      if (prog.sessions?.[platform]?.running) {
        sendResponse({ status: 'already_running', platform });
        return;
      }
      // Start independently — doesn't wait for other platforms
      scrapePlatform(platform, baseUrl).catch(console.error);
      sendResponse({ status: 'started', platform });
    });
    return true;
  }

  // Stop a specific platform's session
  if (message.type === 'STOP_PLATFORM_IMPORT') {
    const { platform } = message;
    setSessionProgress(platform, { stopRequested: true }).then(() => sendResponse({ status: 'stopping', platform }));
    return true;
  }

  // Stop ALL running sessions
  if (message.type === 'STOP_ALL_IMPORTS') {
    getProgress().then(async prog => {
      const updates = Object.entries(prog.sessions || {})
        .filter(([, s]) => s.running)
        .map(([p]) => setSessionProgress(p, { stopRequested: true }));
      await Promise.all(updates);
      sendResponse({ status: 'stopping_all' });
    });
    return true;
  }

  if (message.type === 'GET_SCRAPE_PROGRESS') {
    getProgress().then(sendResponse); return true;
  }

  if (message.type === 'SAVE_CONVERSATION' || message.type === 'CONVERSATION_CAPTURED') {
    saveConversation(message.payload, 'realtime').then(sendResponse); return true;
  }
  if (message.type === 'GET_ALL_CONVERSATIONS') { getAllConversations().then(sendResponse); return true; }
  if (message.type === 'GET_META') {
    chrome.storage.local.get(META_KEY).then(r => sendResponse(r[META_KEY] || { total_conversations: 0, total_messages: 0, platforms: {} })); return true;
  }
  if (message.type === 'EXPORT_DATA')    { exportAllData().then(sendResponse);  return true; }
  if (message.type === 'CLEAR_DATA')     { clearAllData().then(sendResponse);   return true; }
  if (message.type === 'SET_BACKEND_URL') {
    chrome.storage.local.set({ [BACKEND_KEY]: message.url }).then(() => sendResponse({ status: 'saved' })); return true;
  }
  if (message.type === 'GET_BACKEND_URL') {
    chrome.storage.local.get(BACKEND_KEY).then(r => sendResponse({ url: r[BACKEND_KEY] || DEFAULT_BACKEND })); return true;
  }
  if (message.type === 'TEST_BACKEND') { testBackend(message.url).then(sendResponse); return true; }
});

// Clear stale "running" sessions on SW restart
chrome.storage.local.get(PROGRESS_KEY).then(r => {
  const prog = r[PROGRESS_KEY];
  if (!prog?.sessions) return;
  const cleaned = { ...prog, sessions: {} };
  Object.entries(prog.sessions).forEach(([p, s]) => {
    cleaned.sessions[p] = s.running ? { ...s, running: false, done: true, title: 'Interrupted — retry' } : s;
  });
  chrome.storage.local.set({ [PROGRESS_KEY]: cleaned });
  chrome.action.setBadgeText({ text: '' });
});

console.log('[Brain Shadow] Universal background service worker started');
