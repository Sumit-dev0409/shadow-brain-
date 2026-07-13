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

// ── Storage write mutex ─────────────────────────────────────
// chrome.storage.local.get()/.set() are async and NOT transactional.
// Concurrent multi-platform scraping (by design) can call saveConversation()
// from several tabs at once. Without serialization, two overlapping
// "get conversations → modify in memory → set conversations" cycles will
// stomp on each other and silently drop a saved chat — this is the #1
// root cause of chat/message/platform counts not increasing. Every
// read-modify-write of STORAGE_KEY/META_KEY must go through this queue.
let _storageChain = Promise.resolve();
function withStorageLock(fn) {
  const run = _storageChain.then(fn, fn); // run fn even if the previous link rejected
  _storageChain = run.then(() => {}, () => {}); // keep the chain alive on error
  return run;
}

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
  const start = Date.now(); let lastCount = -1, stable = 0;
  while (Date.now() - start < maxMs) {
    try {
      const r = await tabMessage(tabId, { type: 'PING' });
      if (r?.pong) {
        const n = r.messageCount || 0;
        // Require an actual (non-zero) message count before declaring "stable" —
        // a freshly navigated tab reports 0 for the first second or two, and a
        // background/inactive tab (throttled by Chrome) can stay at 0 far longer
        // while it's still hydrating. Treating that as "ready" caused captures
        // to fire on a blank page and silently fail.
        if (n > 0 && n === lastCount) { stable++; if (stable >= 3) return; }
        else { stable = 0; lastCount = n; }
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

<<<<<<< Updated upstream
=======
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

// Enable/disable scrape mode with confirmation + retries. Sending this
// message before the content script's listener is registered means it is
// silently dropped (chrome.tabs.sendMessage with no receiver), leaving the
// new page's scrapeMode flag at its default `false`. That lets the
// content script's own 3.5s auto-capture timer fire a partial (unscrolled)
// snapshot that wins the save-race against the real, fully-scrolled
// CAPTURE_CURRENT sent later — the exact scenario that froze message
// counts on some platforms (most visibly DeepSeek, whose sidebar read is
// slower). Always call this AFTER waitForContentScriptReady()/PING succeeds.
async function setScrapeModeConfirmed(tabId, enabled, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = await tabMessage(tabId, { type: 'SET_SCRAPE_MODE', enabled });
    if (r?.ok) return true;
    await new Promise(res => setTimeout(res, 400));
  }
  return false;
}

>>>>>>> Stashed changes
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
    const tab = await new Promise(resolve => chrome.tabs.create({ url: baseUrl, active: false }, resolve));
    tabId = tab.id;
    await waitForTabLoad(tabId, 2500);

    await setSessionProgress(platform, { title: 'Reading sidebar…' });

<<<<<<< Updated upstream
=======
    // Wait until content script is ready BEFORE talking to it — sending
    // SET_SCRAPE_MODE to a tab whose listener isn't registered yet is
    // silently dropped (see setScrapeModeConfirmed's comment above).
    const ready = await waitForContentScriptReady(tabId);
    if (!ready) {
      console.warn(`[${platform}] Content script did not respond to PING after ${15}s — aborting`);
      await setSessionProgress(platform, { running: false, done: true, title: 'Content script not ready' });
      return;
    }

    // Now that the content script is confirmed listening, suppress
    // auto-capture — retried until acknowledged so it never races the
    // page's own 3.5s auto-capture timer.
    const scrapeModeSet = await setScrapeModeConfirmed(tabId, true);
    if (!scrapeModeSet) {
      console.warn(`[${platform}] Could not confirm scrape mode ON — auto-capture may race the bulk capture`);
    }

    console.log(`[${platform}] Sending GET_SIDEBAR_CHATS...`);
>>>>>>> Stashed changes
    const threads = await tabMessage(tabId, { type: 'GET_SIDEBAR_CHATS' }) || [];

    if (!threads.length) {
      await setSessionProgress(platform, { running: false, done: true, pct: 100, title: 'No conversations found' });
      return;
    }

    // Filter already-captured conversations — but only skip ones captured
    // recently. Without a freshness window, a conversation captured once
    // was excluded from every future bulk import forever, even after the
    // user kept chatting in it — so its message count and enrichment in the
    // DB would stay frozen at whatever it was on the very first capture,
    // no matter how much the real conversation grew afterward.
    const RECAPTURE_AFTER_MS = 6 * 60 * 60 * 1000; // re-check anything older than 6h
    const existing = await getAllConversations();
    const capturedPaths = new Map();
    for (const c of existing) {
      try {
        const path   = new URL(c.url).pathname;
        const savedAt = new Date(c.saved_at || 0).getTime();
        const prev    = capturedPaths.get(path);
        if (!prev || savedAt > prev) capturedPaths.set(path, savedAt);
      } catch { /* skip unparseable URLs — treat as not captured */ }
    }
    const now = Date.now();
    const newThreads = threads.filter(t => {
      try {
        const savedAt = capturedPaths.get(new URL(t.url).pathname);
        return savedAt === undefined || (now - savedAt) > RECAPTURE_AFTER_MS;
      } catch { return true; }
    });
    const skipped = threads.length - newThreads.length;

    if (!newThreads.length) {
      await setSessionProgress(platform, { running: false, done: true, pct: 100, skipped, title: `All ${threads.length} already captured` });
      return;
    }

    await setSessionProgress(platform, { total: newThreads.length, skipped, title: `Found ${newThreads.length} new chats` });

    let savedCount = 0, syncedCount = 0, failedCount = 0;

    for (let i = 0; i < newThreads.length; i++) {
      // Check this session's stop flag (not global — each session has its own)
      const prog = await getProgress();
      if (prog.sessions?.[platform]?.stopRequested) break;

      const { url, title } = newThreads[i];
      const pct = Math.round(((i + 1) / newThreads.length) * 100);

      await setSessionProgress(platform, { current: i + 1, pct, title });
      chrome.action.setBadgeText({ text: `${pct}%` });

      try {
        await navigateTab(tabId, url, 1500);
<<<<<<< Updated upstream
=======
        console.log(`[${platform}] Waiting for content script...`);
        // Confirm the NEW content script instance (navigating re-injects it)
        // is actually listening before telling it to suppress auto-capture —
        // otherwise the message is dropped and the page's own auto-capture
        // timer can save a partial snapshot first.
        const navReady = await waitForContentScriptReady(tabId, 15000);
        if (navReady) {
          await setScrapeModeConfirmed(tabId, true, 3);
        } else {
          console.warn(`[${platform}] Content script not ready after navigation — proceeding anyway`);
        }
>>>>>>> Stashed changes
        await waitForContentScript(tabId);

        let captureResult = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          captureResult = await tabMessage(tabId, { type: 'CAPTURE_CURRENT' });
<<<<<<< Updated upstream
          if (captureResult?.status === 'saved' || captureResult?.status === 'skipped') break;
=======
          console.log(`[${platform}] CAPTURE_CURRENT returned: ${JSON.stringify(captureResult)}`);
          if (captureResult?.status === 'saved' || captureResult?.status === 'updated' || captureResult?.status === 'skipped' || captureResult?.status === 'empty') break;
>>>>>>> Stashed changes
          await new Promise(r => setTimeout(r, 2000));
        }

        // Only count it as saved if a capture attempt actually succeeded —
        // previously this incremented unconditionally, so the reported
        // "N saved" count included chats that failed every retry and were
        // never written to storage or synced.
        if (captureResult?.status === 'saved' || captureResult?.status === 'skipped') {
          savedCount++;
          if (captureResult?.synced) syncedCount++;
          await addToTotals(1, captureResult?.synced ? 1 : 0);
        } else {
          failedCount++;
          console.warn(`[Brain Shadow] ${platform} capture failed for "${title}" after 3 attempts:`, captureResult);
        }

      } catch (e) {
        failedCount++;
        console.error(`[Brain Shadow] ${platform} error:`, e.message);
      }

      await new Promise(r => setTimeout(r, 150));
    }

    await setSessionProgress(platform, {
      running: false, done: true, pct: 100, savedCount, syncedCount, failedCount,
      title: failedCount > 0
        ? `Done — ${savedCount} saved · ${syncedCount} synced · ${failedCount} failed`
        : `Done — ${savedCount} saved · ${syncedCount} synced`,
    });

  } catch (err) {
    console.error(`[Brain Shadow] ${platform} scrape failed:`, err.message);
    await setSessionProgress(platform, { running: false, done: true, title: `Error: ${err.message}` });
  } finally {
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
// Single source of truth for chat/message/platform stats: every write to
// STORAGE_KEY goes through withStorageLock (no lost updates from
// concurrent multi-platform scraping) and is immediately followed by
// updateMeta() recomputed from the FULL conversation set (no drift between
// META_KEY and what's actually stored). Network sync happens outside the
// lock so a slow backend never blocks other tabs' saves.
async function saveConversation(data, source = 'realtime') {
<<<<<<< Updated upstream
  try {
    const result        = await chrome.storage.local.get(STORAGE_KEY);
    const conversations = result[STORAGE_KEY] || {};
    const key           = `${data.platform}_${data.external_id}`;
    const existing      = conversations[key];

    if (source === 'bulk' && existing && existing.messages.length >= data.messages.length)
      return { status: 'skipped', reason: 'no_change' };

    conversations[key] = { ...data, saved_at: new Date().toISOString(), message_count: data.messages.length, source, synced: false };
    await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
    await updateMeta(conversations);
=======
  const platform     = data.platform || 'unknown';
  const external_id  = data.external_id || '';
  const messageCount = data.messages?.length || 0;
  const key          = `${platform}_${external_id}`;

  console.log(`[${platform}] saveConversation: ID=${external_id} messages=${messageCount} source=${source} key=${key}`);

  // ── Locked section: read → merge/insert → write conversations + meta ──
  const local = await withStorageLock(async () => {
    try {
      const result         = await chrome.storage.local.get(STORAGE_KEY);
      const conversations  = result[STORAGE_KEY] || {};
      const existing       = conversations[key];

      // True duplicate: this key exists AND the incoming capture has no
      // new information (same or fewer messages). Per spec, this must
      // never touch any counter — bail out before writing anything.
      if (existing && messageCount <= (existing.message_count || 0)) {
        console.log(`[${platform}] Duplicate — "${data.title}" (ID: ${external_id}) already has ${existing.message_count || 0} messages (incoming: ${messageCount})`);
        return { status: 'skipped', reason: 'duplicate', key, message_count: existing.message_count || 0 };
      }

      // Either a brand-new chat, OR an existing chat whose new capture has
      // MORE messages than what's stored (e.g. the real, fully-scrolled
      // CAPTURE_CURRENT arriving after an earlier partial auto-capture).
      // In both cases we write — this is what lets message counts
      // self-heal instead of freezing at whatever arrived first.
      const status = existing ? 'updated' : 'saved';
      conversations[key] = {
        ...data,
        saved_at: new Date().toISOString(),
        message_count: messageCount,
        source,
        // Keep the existing synced flag only if we didn't actually change
        // anything meaningful; otherwise it needs to (re)sync below.
        synced: existing && status === 'updated' ? false : (existing?.synced || false),
      };
>>>>>>> Stashed changes

      await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
      console.log(`[${platform}] About to updateMeta — totalKeys=${Object.keys(conversations).length}`);
      await updateMeta(conversations);
      console.log(`[${platform}] Conversation ${status}: "${data.title}" (ID: ${external_id}, messages: ${messageCount})`);
      console.log(`[${platform}] Chat count updated: ${Object.keys(conversations).length} total`);
      console.log(`[${platform}] Message count updated: ${messageCount} messages in this conversation`);
      console.log(`[${platform}] Platform count updated`);

<<<<<<< Updated upstream
    console.log(`[Brain Shadow] ${source === 'realtime' ? '🔴' : '📦'} saved: ${data.title} | synced: ${syncResult.ok}`);
    return { status: 'saved', key, synced: syncResult.ok };
  } catch (err) {
    return { status: 'error', error: err.message };
=======
      return { status, key, message_count: messageCount };
    } catch (err) {
      console.error(`[${platform}] Save error: ${err.message}`);
      return { status: 'error', error: err.message };
    }
  });

  if (local.status === 'skipped' || local.status === 'error') return local;

  // ── Sync to backend (outside the lock — network I/O must not block
  //    other tabs' saves during concurrent scraping) ──
  const syncResult = await syncToBackend(data);
  if (syncResult.ok) {
    await withStorageLock(async () => {
      const result        = await chrome.storage.local.get(STORAGE_KEY);
      const conversations = result[STORAGE_KEY] || {};
      if (conversations[key]) {
        conversations[key].synced = true;
        await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
      }
    });
>>>>>>> Stashed changes
  }

  console.log(`[${platform}] Save result: ${local.status} | synced: ${syncResult.ok}`);
  return { status: local.status, key, synced: syncResult.ok, message_count: messageCount };
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
  return withStorageLock(async () => {
    await chrome.storage.local.remove([STORAGE_KEY, META_KEY, PROGRESS_KEY]);
    return { status: 'cleared' };
  });
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

  // Sync ALL local conversations to backend (runs in SW — survives popup close)
  if (message.type === 'SYNC_ALL_TO_BACKEND') {
    (async () => {
      const r          = await chrome.storage.local.get([STORAGE_KEY, BACKEND_KEY]);
      const convs      = Object.values(r[STORAGE_KEY] || {});
      const backendUrl = (r[BACKEND_KEY] || DEFAULT_BACKEND).replace(/\/$/, '');
      let synced = 0, failed = 0;
      for (const conv of convs) {
        const result = await syncToBackend(conv).catch(err => ({ ok: false, error: err.message }));
        if (result.ok) {
          synced++;
        } else {
          failed++;
          console.warn(`[Brain Shadow] Sync failed for "${conv.title}" (${conv.platform}):`, result.error);
        }
      }
      console.log(`[Brain Shadow] SYNC_ALL_TO_BACKEND: ${synced}/${convs.length} synced, ${failed} failed`);
      sendResponse({ synced, failed, total: convs.length });
    })();
    return true;
  }
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

// On every SW startup: push all locally stored conversations to backend
(async () => {
  try {
    const r          = await chrome.storage.local.get([STORAGE_KEY, BACKEND_KEY]);
    const convs      = Object.values(r[STORAGE_KEY] || {});
    if (!convs.length) return;
    const backendUrl = (r[BACKEND_KEY] || DEFAULT_BACKEND).replace(/\/$/, '');
    // Test backend first
    const health = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (!health?.ok) return;
    for (const conv of convs) {
      await syncToBackend(conv).catch(() => {});
    }
    console.log(`[Brain Shadow] Startup sync: pushed ${convs.length} conversations`);
  } catch {}
})();

console.log('[Brain Shadow] Universal background service worker started');
