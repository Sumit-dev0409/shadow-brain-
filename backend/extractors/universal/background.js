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
const JWT_KEY      = 'brain_shadow_jwt_token';
const DEFAULT_BACKEND = 'https://shadow-brain-u4ua.onrender.com';

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

// ══════════════════════════════════════════════════════════
// SCRAPE ONE PLATFORM — fully independent, own hidden tab
// ══════════════════════════════════════════════════════════
async function scrapePlatform(platform, baseUrl) {
  activeSessions++;
  startKeepAlive();

  await setSessionProgress(platform, {
    running: true, done: false, stopRequested: false, phase: 'init',
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

    // ════════════════════════════════════════════════════════
    // PHASE 1 — DISCOVER ALL CHATS
    //
    // The content script walks the ENTIRE virtualized sidebar (scroll →
    // harvest → merge into a persistent map → repeat until the real end
    // of the list) and only then reports back. Scraping cannot start
    // before this resolves — there is no chat-count cap anywhere; the
    // discovered total IS however many conversations the account has.
    // ════════════════════════════════════════════════════════
    await setSessionProgress(platform, {
      phase: 'discovery', discovered: 0, total: 0,
      title: 'Discovering all chats…',
    });
    console.log(`[Brain Shadow][DISCOVERY] ${platform} discovery started`);

    await tabMessage(tabId, { type: 'RESET_DISCOVERY' });
    await tabMessage(tabId, { type: 'START_DISCOVERY' });

    // Poll-driven (not one long message) so the MV3 service worker stays
    // alive via repeated activity even when discovery takes many minutes
    // on accounts with hundreds of chats.
    const DISCOVERY_MAX_MS = 15 * 60 * 1000;
    const discStart = Date.now();
    let lastSeenTotal = -1, lastBoostAt = 0;
    while (Date.now() - discStart < DISCOVERY_MAX_MS) {
      await new Promise(r => setTimeout(r, 700));

      const prog = await getProgress();
      if (prog.sessions?.[platform]?.stopRequested) {
        await tabMessage(tabId, { type: 'STOP_DISCOVERY' }).catch(() => {});
        break;
      }

      const st = await tabMessage(tabId, { type: 'DISCOVERY_POLL' });
      if (st) {
        if (st.total !== lastSeenTotal) {
          lastSeenTotal = st.total;
          await setSessionProgress(platform, { discovered: st.total, stalled: !!st.stalled });
          console.log(`[Brain Shadow][DISCOVERY] ${platform} progress → ${st.total} unique chats`);
        }
        // Hidden tabs get timer-throttled by Chrome after a few minutes,
        // which can freeze the sidebar's virtualizer mid-discovery. If the
        // engine reports zero movement, briefly foreground the tab to
        // flush rendering, then hide it again.
        if (st.stalled && !st.done && Date.now() - lastBoostAt > 25000) {
          lastBoostAt = Date.now();
          console.log(`[Brain Shadow][DISCOVERY] ${platform} renderer stalled — boosting hidden tab`);
          try {
            await chrome.tabs.update(tabId, { active: true });
            await new Promise(r => setTimeout(r, 1500));
            await chrome.tabs.update(tabId, { active: false });
          } catch {}
          await setSessionProgress(platform, { stalled: false });
        }
        if (st.done || st.error) break;
      }
    }

    // Discovery is complete — fetch the FULL deduplicated list.
    const discRes = await tabMessage(tabId, { type: 'GET_DISCOVERED_CHATS' });
    const threads = (discRes?.chats || []).filter(t => t && t.url);

    if (!threads.length) {
      await setSessionProgress(platform, { running: false, done: true, pct: 100, title: 'No conversations found' });
      return;
    }

    console.log(`[Brain Shadow][DISCOVERY] ${platform}: discovery complete — ${threads.length} unique chats`);

    // ════════════════════════════════════════════════════════
    // PHASE 2 — CREATE COMPLETE SCRAPING QUEUE & START SCRAPING
    //
    // The queue is built from the DISCOVERED total. Denominator in the UI
    // always equals threads.length. Duplicate prevention is preserved:
    // recently-captured conversations are skipped in place (without
    // navigating), so progress still walks 1..discoveredTotal.
    // ════════════════════════════════════════════════════════
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

    await setSessionProgress(platform, {
      phase: 'scrape',
      total: threads.length,
      discoveredTotal: threads.length,
      title: `Discovered ${threads.length} chats — starting…`,
    });

    let savedCount = 0, syncedCount = 0, failedCount = 0, skipped = 0;

    for (let i = 0; i < threads.length; i++) {
      // Check this session's stop flag (not global — each session has its own)
      const prog = await getProgress();
      if (prog.sessions?.[platform]?.stopRequested) break;

      const thread = threads[i];
      const pct = Math.round(((i + 1) / threads.length) * 100);

      await setSessionProgress(platform, { current: i + 1, pct, title: thread.title || thread.url });
      chrome.action.setBadgeText({ text: `${pct}%` });

      // Skip recently-captured duplicates WITHOUT navigating (fast path).
      let fresh = true;
      try {
        const savedAt = capturedPaths.get(new URL(thread.url).pathname);
        fresh = savedAt === undefined || (now - savedAt) > RECAPTURE_AFTER_MS;
      } catch { fresh = true; }
      if (!fresh) { skipped++; continue; }

      try {
        await navigateTab(tabId, thread.url, 1500);
        await waitForContentScript(tabId);

        let captureResult = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          captureResult = await tabMessage(tabId, { type: 'CAPTURE_CURRENT' });
          if (captureResult?.status === 'saved' || captureResult?.status === 'skipped') break;
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
          try { capturedPaths.set(new URL(thread.url).pathname, Date.now()); } catch {}
        } else {
          failedCount++;
          console.warn(`[Brain Shadow] ${platform} capture failed for "${thread.title}" after 3 attempts:`, captureResult);
        }

      } catch (e) {
        failedCount++;
        console.error(`[Brain Shadow] ${platform} error:`, e.message);
      }

      await new Promise(r => setTimeout(r, 150));
    }

    await setSessionProgress(platform, {
      running: false, done: true, pct: 100, phase: 'done',
      savedCount, syncedCount, failedCount, skipped,
      discoveredTotal: threads.length,
      title: failedCount > 0
        ? `Done — ${savedCount} saved · ${syncedCount} synced · ${failedCount} failed · ${skipped} skipped`
        : `Done — ${savedCount} saved · ${syncedCount} synced${skipped ? ` · ${skipped} already had` : ''}`,
    });

  } catch (err) {
    console.error(`[Brain Shadow] ${platform} scrape failed:`, err.message);
    await setSessionProgress(platform, { running: false, done: true, title: `Error: ${err.message}` });
  } finally {
    // Let the content script drop its discovery state before the tab closes
    if (tabId) await tabMessage(tabId, { type: 'RESET_DISCOVERY' }).catch(() => {});
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
    console.log(`[JWT-RUNTIME] ═══ saveConversation called (source=${source}) ═══`);
    console.log(`[JWT-RUNTIME]   title:    ${(data?.title || '').slice(0, 60)}`);
    console.log(`[JWT-RUNTIME]   platform: ${data?.platform || 'unknown'}`);
    const result        = await chrome.storage.local.get(STORAGE_KEY);
    const conversations = result[STORAGE_KEY] || {};
    const key           = `${data.platform}_${data.external_id}`;
    const existing      = conversations[key];

    if (source === 'bulk' && existing && existing.messages.length >= data.messages.length)
      return { status: 'skipped', reason: 'no_change' };

    conversations[key] = { ...data, saved_at: new Date().toISOString(), message_count: data.messages.length, source, synced: false };
    await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
    await updateMeta(conversations);

    // Sync to backend immediately (fire and forget — local save already succeeded)
    const syncResult = await syncToBackend(data);
    if (syncResult.ok) {
      conversations[key].synced = true;
      await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
    }

    console.log(`[Brain Shadow] ${source === 'realtime' ? '🔴' : '📦'} saved: ${data.title} | synced: ${syncResult.ok}`);
    return { status: 'saved', key, synced: syncResult.ok };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function syncToBackend(data) {
  try {
    const r          = await chrome.storage.local.get([BACKEND_KEY, JWT_KEY]);
    const backendUrl = (r[BACKEND_KEY] || DEFAULT_BACKEND).replace(/\/$/, '');
    const token      = r[JWT_KEY];

    // ── RUNTIME LOG: JWT value from storage ──
    console.log(`[JWT-RUNTIME] ═══ syncToBackend START ═══`);
    console.log(`[JWT-RUNTIME]   backendUrl:     ${backendUrl}`);
    console.log(`[JWT-RUNTIME]   title:          ${(data?.title || '').slice(0, 60)}`);
    console.log(`[JWT-RUNTIME]   platform:       ${data?.platform || 'unknown'}`);
    console.log(`[JWT-RUNTIME]   token type:     ${typeof token}`);
    console.log(`[JWT-RUNTIME]   token is null:  ${token === null}`);
    console.log(`[JWT-RUNTIME]   token is undef: ${token === undefined}`);
    console.log(`[JWT-RUNTIME]   token is empty: ${token === ''}`);
    console.log(`[JWT-RUNTIME]   token length:   ${token?.length ?? 0}`);
    console.log(`[JWT-RUNTIME]   token preview:  ${token ? token.slice(0, 40) + '...' : 'N/A'}`);
    console.log(`[JWT-RUNTIME]   token full:     ${JSON.stringify(token)}`);

    // ── Stack trace to identify caller ──
    console.log(`[JWT-RUNTIME]   caller stack:   ${new Error().stack}`);

    if (!token) {
      console.warn(`[JWT-RUNTIME] ═══ BLOCKED: No token — sync aborted ═══`);
      throw new Error('No authentication token found. Please log in to Brain Shadow first.');
    }

    // ── RUNTIME LOG: Complete headers object ──
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
    console.log(`[JWT-RUNTIME] ═══ FETCH headers ═══`);
    console.log(`[JWT-RUNTIME]   headers object: ${JSON.stringify(headers)}`);
    console.log(`[JWT-RUNTIME]   Authorization:  ${headers['Authorization'] ? headers['Authorization'].slice(0, 50) + '...' : 'MISSING'}`);
    console.log(`[JWT-RUNTIME]   Authorization length: ${headers['Authorization']?.length ?? 0}`);

    const url = `${backendUrl}/api/import/capture`;
    console.log(`[JWT-RUNTIME]   fetch URL:      ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    console.log(`[JWT-RUNTIME] ═══ FETCH response ═══`);
    console.log(`[JWT-RUNTIME]   status:   ${response.status} ${response.statusText}`);
    console.log(`[JWT-RUNTIME]   ok:       ${response.ok}`);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[JWT-RUNTIME]   response body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${response.status}`);
    }
    return { ok: true };
  } catch (err) {
    console.error(`[JWT-RUNTIME] ═══ syncToBackend FAILED ═══`);
    console.error(`[JWT-RUNTIME]   error: ${err.message}`);
    console.error(`[JWT-RUNTIME]   stack: ${err.stack}`);
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
  await chrome.storage.local.remove([STORAGE_KEY, META_KEY, PROGRESS_KEY]);
  return { status: 'cleared' };
}

// ── Message handler ────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Handle Token pairing from Web bridge
  if (message.type === 'SET_JWT') {
    const incomingToken = message.token;
    const incomingType  = typeof incomingToken;
    const incomingIsNull = incomingToken === null;
    const incomingIsUndefined = incomingToken === undefined;
    const incomingIsEmpty = incomingToken === '';
    const incomingLength = incomingToken?.length ?? 0;
    console.log(`[JWT-RUNTIME] ═══ SET_JWT received ═══`);
    console.log(`[JWT-RUNTIME]   type:       ${incomingType}`);
    console.log(`[JWT-RUNTIME]   is null:    ${incomingIsNull}`);
    console.log(`[JWT-RUNTIME]   is undef:   ${incomingIsUndefined}`);
    console.log(`[JWT-RUNTIME]   is empty:   ${incomingIsEmpty}`);
    console.log(`[JWT-RUNTIME]   length:     ${incomingLength}`);
    console.log(`[JWT-RUNTIME]   preview:    ${incomingToken ? incomingToken.slice(0, 40) + '...' : 'N/A'}`);
    console.log(`[JWT-RUNTIME]   full value: ${JSON.stringify(incomingToken)}`);

    chrome.storage.local.set({ [JWT_KEY]: incomingToken }).then(async () => {
      // Immediately read back to verify what was actually stored
      const verify = await chrome.storage.local.get(JWT_KEY);
      const stored = verify[JWT_KEY];
      console.log(`[JWT-RUNTIME] ═══ AFTER SET — verify readback ═══`);
      console.log(`[JWT-RUNTIME]   stored type:    ${typeof stored}`);
      console.log(`[JWT-RUNTIME]   stored is null: ${stored === null}`);
      console.log(`[JWT-RUNTIME]   stored length:  ${stored?.length ?? 0}`);
      console.log(`[JWT-RUNTIME]   stored preview: ${stored ? stored.slice(0, 40) + '...' : 'N/A'}`);
      console.log(`[JWT-RUNTIME]   stored full:    ${JSON.stringify(stored)}`);
      console.log(`[JWT-RUNTIME]   match:          ${stored === incomingToken}`);
      sendResponse({ status: 'saved', stored });
    });
    return true;
  }

  if (message.type === 'GET_JWT') {
    chrome.storage.local.get(JWT_KEY).then(result => {
      const jwt = result[JWT_KEY] || null;
      console.log(`[JWT-RUNTIME] ═══ GET_JWT requested ═══`);
      console.log(`[JWT-RUNTIME]   has token: ${!!jwt}`);
      console.log(`[JWT-RUNTIME]   type:      ${typeof jwt}`);
      console.log(`[JWT-RUNTIME]   length:    ${jwt?.length ?? 0}`);
      console.log(`[JWT-RUNTIME]   preview:   ${jwt ? jwt.slice(0, 40) + '...' : 'N/A'}`);
      console.log(`[JWT-RUNTIME]   full:      ${JSON.stringify(jwt)}`);
      sendResponse({ token: jwt });
    });
    return true;
  }

  // Live discovery heartbeat from the content script (Phase 1 progress +
  // MV3 keep-alive during long discoveries). The poll loop in scrapePlatform
  // is authoritative; this just mirrors the count sooner.
  if (message.type === 'DISCOVERY_PROGRESS') {
    setSessionProgress(message.platform, {
      discovered: message.discovered || 0,
      stalled: !!message.stalled,
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

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
      console.log(`[JWT-RUNTIME] ═══ SYNC_ALL_TO_BACKEND triggered ═══`);
      const jwtCheck = await chrome.storage.local.get(JWT_KEY);
      console.log(`[JWT-RUNTIME]   JWT in storage at sync time: ${jwtCheck[JWT_KEY] ? 'YES (len=' + jwtCheck[JWT_KEY].length + ')' : 'NO'}`);
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
      console.log(`[JWT-RUNTIME] ═══ SYNC_ALL_TO_BACKEND done: ${synced}/${convs.length} synced, ${failed} failed ═══`);
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
    console.log(`[JWT-RUNTIME] ═══ STARTUP SYNC fired ═══`);
    const r          = await chrome.storage.local.get([STORAGE_KEY, BACKEND_KEY, JWT_KEY]);
    const convs      = Object.values(r[STORAGE_KEY] || {});
    const jwtAtStartup = r[JWT_KEY];
    console.log(`[JWT-RUNTIME]   conversations to sync: ${convs.length}`);
    console.log(`[JWT-RUNTIME]   JWT at startup: ${jwtAtStartup ? 'PRESENT (len=' + jwtAtStartup.length + ')' : 'MISSING'}`);
    console.log(`[JWT-RUNTIME]   JWT preview: ${jwtAtStartup ? jwtAtStartup.slice(0, 40) + '...' : 'N/A'}`);
    if (!convs.length) {
      console.log(`[JWT-RUNTIME]   No conversations — startup sync skipped`);
      return;
    }
    const backendUrl = (r[BACKEND_KEY] || DEFAULT_BACKEND).replace(/\/$/, '');
    // Test backend first
    const health = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (!health?.ok) {
      console.log(`[JWT-RUNTIME]   Backend unreachable — startup sync aborted`);
      return;
    }
    let syncedCount = 0, failedCount = 0;
    for (const conv of convs) {
      console.log(`[JWT-RUNTIME]   Startup sync calling syncToBackend for "${(conv.title || '').slice(0, 40)}"`);
      const result = await syncToBackend(conv).catch(() => ({ ok: false }));
      if (result.ok) syncedCount++;
      else failedCount++;
    }
    console.log(`[JWT-RUNTIME] ═══ STARTUP SYNC done: ${syncedCount}/${convs.length} synced, ${failedCount} failed ═══`);
  } catch (err) {
    console.error(`[JWT-RUNTIME]   Startup sync threw: ${err.message}`);
  }
})();

console.log('[Brain Shadow] Universal background service worker started');
