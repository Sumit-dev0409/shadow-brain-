/**
 * Brain Shadow — Gemini Content Script v3
 *
 * Architecture matches ChatGPT extractor:
 *  - Streaming guard before capture
 *  - MutationObserver for live auto-capture
 *  - SPA navigation watcher
 *  - CAPTURE_CURRENT / PING / GET_SIDEBAR_CHATS message handlers
 *  - Messages use { role, content, index, timestamp } format
 */

// ── Constants ──────────────────────────────────────────────
const PLATFORM = 'gemini';

const CONV_URL_RE = /\/app\/([a-zA-Z0-9_\-]{4,})/;

const USER_SEL = [
  'user-query', '.user-query',
  '[data-message-author-role="user"]',
  '.user-request-text', '.query-text',
  '[class*="user-query"]', '[class*="human-turn"]',
];
const ASST_SEL = [
  'model-response', '.model-response',
  '[data-message-author-role="model"]',
  '.response-content', '.model-response-text',
  'message-content',
  '[class*="model-response"]', '[class*="ai-turn"]',
];

// Selectors that indicate Gemini is still generating
const STREAMING_INDICATORS = [
  'button[aria-label="Stop generating"]',
  'button[aria-label="Stop response"]',
  '[data-test-id="stop-stream-button"]',
  '.stop-button', '[class*="stop-button"]',
  '.loading-indicator', '[class*="loading-indicator"]',
  'mat-progress-bar',
];

// ── Streaming guard ────────────────────────────────────────
function isStreaming() {
  return STREAMING_INDICATORS.some(sel => document.querySelector(sel) !== null);
}

function waitForStreamingToFinish() {
  return new Promise((resolve) => {
    if (!isStreaming()) { resolve(); return; }
    console.log('[Brain Shadow] Waiting for Gemini to finish streaming…');
    const hard = setTimeout(resolve, 90_000);
    const poll = setInterval(() => {
      if (!isStreaming()) {
        clearInterval(poll);
        clearTimeout(hard);
        setTimeout(resolve, 800);
      }
    }, 500);
  });
}

// ── Overlay ────────────────────────────────────────────────
let overlayEl = null;

function showOverlay(data) {
  try {
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.style.cssText = [
        'position:fixed','top:10px','right:10px',
        'background:linear-gradient(135deg,#1a73e8,#0d47a1)',
        'color:#fff','padding:12px 20px','border-radius:8px',
        'font-family:-apple-system,sans-serif','font-size:13px',
        'font-weight:500','z-index:999999',
        'box-shadow:0 4px 12px rgba(0,0,0,.3)','max-width:300px',
      ].join(';');
      document.body.appendChild(overlayEl);
    }
    const pct = data.percentage || 0;
    overlayEl.innerHTML = `
      <div style="margin-bottom:8px"><strong>🔄 Brain Shadow — Gemini</strong></div>
      <div style="font-size:12px;margin-bottom:6px">${data.current||0} / ${data.total||0} chats</div>
      <div style="width:260px;height:4px;background:rgba(255,255,255,.3);border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#4CAF50;border-radius:2px"></div>
      </div>
      <div style="font-size:11px;margin-top:6px;color:rgba(255,255,255,.8)">${pct}% — ${data.title||'…'}</div>
    `;
  } catch {}
}

function removeOverlay() { overlayEl?.remove(); overlayEl = null; }

// ── Scroll conversation to load all messages ───────────────
function getConversationContainer() {
  // Strategy 1: walk up from a message element to find scrollable parent
  const anchor = document.querySelector(USER_SEL.join(','));
  if (anchor) {
    let el = anchor.parentElement;
    while (el && el !== document.documentElement) {
      const s = window.getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50)
        return el;
      el = el.parentElement;
    }
  }
  // Strategy 2: probe known Gemini virtual-scroll containers
  for (const sel of ['[class*="scroll-container"]', '[class*="conversation"]', '[role="region"]', 'main', '[class*="content"]']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const s = window.getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) return el;
  }
  // Strategy 3: find any scrollable element inside main
  const main = document.querySelector('main') || document.body;
  const candidates = [...main.querySelectorAll('*')].filter(el => {
    const s = window.getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 100;
  }).sort((a, b) => b.scrollHeight - a.scrollHeight);
  if (candidates.length) return candidates[0];
  return document.documentElement;
}

function countVisibleMessages() {
  let count = 0;
  for (const sel of USER_SEL) count += document.querySelectorAll(sel).length;
  for (const sel of ASST_SEL) count += document.querySelectorAll(sel).length;
  return count;
}

function scrollToLoadAllMessages() {
  return new Promise((resolve) => {
    const c   = getConversationContainer();
    if (!c) { resolve(); return; }
    const maxPasses = 8;
    let pass  = 0;
    let prevCount = countVisibleMessages();

    const safety = setTimeout(resolve, 40_000);

    function doPass() {
      if (++pass > maxPasses) { clearTimeout(safety); resolve(); return; }

      // Scroll all the way up first (triggers Gemini to load earliest messages)
      c.scrollTop = 0;
      setTimeout(() => {
        // Then scroll down in small steps
        const step = Math.max(150, Math.floor((c.clientHeight || 600) * 0.4));
        let pos = 0;
        const tick = () => {
          pos += step;
          c.scrollTop = pos;
          setTimeout(() => {
            if (pos < c.scrollHeight) {
              tick();
            } else {
              // Scroll back to top for the next pass
              c.scrollTop = 0;
              const newCount = countVisibleMessages();
              if (newCount > prevCount) {
                prevCount = newCount;
                setTimeout(doPass, 600);
              } else {
                clearTimeout(safety); resolve();
              }
            }
          }, 350);
        };
        setTimeout(tick, 300);
      }, 400);
    }

    // Ensure we start at top and do first pass
    c.scrollTop = 0;
    setTimeout(doPass, 300);
  });
}

// ── Text extraction ────────────────────────────────────────
function extractText(el) {
  return el.innerText?.trim() || null;
}

// ── Helpers ────────────────────────────────────────────────
function deduplicateConsecutiveRoles(messages) {
  if (!messages.length) return messages;
  const out = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = out[out.length - 1];
    if (messages[i].role === prev.role) {
      if (messages[i].content.length > prev.content.length)
        out[out.length - 1] = messages[i];
    } else {
      out.push(messages[i]);
    }
  }
  return out;
}

function assignRelativeTimestamps(messages) {
  const now  = Date.now();
  const STEP = 1000;
  return messages.map((msg, i) => ({
    ...msg,
    index:     i,
    timestamp: new Date(now - (messages.length - 1 - i) * STEP).toISOString(),
  }));
}

function extractGeminiId(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const idx   = parts.findIndex(p => p === 'app');
    return idx !== -1 && parts[idx + 1] ? parts[idx + 1] : parts[parts.length - 1];
  } catch { return url; }
}

// ── Core scraper ───────────────────────────────────────────
function scrapeConversation() {
  let userEls = [], asstEls = [];

  for (const sel of USER_SEL) {
    const found = [...document.querySelectorAll(sel)];
    if (found.length) { userEls = found; break; }
  }
  for (const sel of ASST_SEL) {
    const found = [...document.querySelectorAll(sel)];
    if (found.length) { asstEls = found; break; }
  }

  if (!userEls.length && !asstEls.length) {
    console.warn('[Brain Shadow] No message elements found');
    return null;
  }

  const allItems = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...asstEls.map(el => ({ el, role: 'assistant' })),
  ].sort((a, b) =>
    a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );

  let messages = allItems
    .map(({ el, role }) => {
      const content = extractText(el);
      return content && content.length > 3 ? { role, content } : null;
    })
    .filter(Boolean);

  messages = deduplicateConsecutiveRoles(messages);

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') {
    console.log('[Brain Shadow] Conversation incomplete — skipping');
    return null;
  }

  messages = assignRelativeTimestamps(messages);

  const external_id = extractGeminiId(location.href);
  const title       = document.title?.replace(' - Gemini', '').trim() || external_id;

  console.log(`[Brain Shadow] Gemini scraped: ${messages.length} messages — "${title}"`);
  return {
    platform:      PLATFORM,
    external_id,
    url:           location.href,
    title,
    message_count: messages.length,
    messages,
    captured_at:   new Date().toISOString(),
  };
}

// ── Capture pipeline ───────────────────────────────────────
let isCapturing = false;

async function captureAndSend(scroll = true) {
  if (isCapturing) return { status: 'busy' };
  isCapturing = true;

  try {
    await waitForStreamingToFinish();
    if (scroll) {
      await scrollToLoadAllMessages();
    } else {
      // Auto-capture: gentle single pass so virtual scroll loads at least visible range
      const c = getConversationContainer();
      if (c) { c.scrollTop = 0; await new Promise(r => setTimeout(r, 300)); c.scrollTop = c.scrollHeight; await new Promise(r => setTimeout(r, 1000)); }
    }

    const conversation = scrapeConversation();
    if (!conversation) return { status: 'empty' };

    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'SAVE_CONVERSATION', payload: conversation },
        (r) => resolve(chrome.runtime.lastError ? { status: 'error' } : (r || { status: 'unknown' }))
      );
    });

    return { ...result, title: conversation.title, message_count: conversation.messages.length };
  } finally {
    isCapturing = false;
  }
}

// ── MutationObserver: live auto-capture ────────────────────
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => captureAndSend(false), 3000);
});

function waitForChatAndObserve() {
  const root = document.querySelector('main') || document.body;
  observer.observe(root, { childList: true, subtree: true });
  console.log('[Brain Shadow] Observer attached (Gemini)');
  setTimeout(captureAndSend, 3500);
}

// ── SPA navigation watcher ─────────────────────────────────
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.log('[Brain Shadow] Navigation →', location.href);
    setTimeout(() => captureAndSend(true), 4000);
  }
}).observe(document, { subtree: true, childList: true });

// ── Sidebar: get conversation URLs ────────────────────────
function extractRecents() {
  const allLinks = Array.from(document.querySelectorAll('a[href]'));
  console.log(`[Brain Shadow] Gemini <a> tags: ${allLinks.length}`);
  console.log('[Brain Shadow] ALL hrefs:\n' + [...new Set(allLinks.map(a => a.getAttribute('href')))].slice(0, 50).join('\n'));

  const seen    = new Set();
  const threads = [];

  // Pass 1 — primary regex
  for (const link of allLinks) {
    const href = link.href || '';
    if (!CONV_URL_RE.test(href)) continue;
    let canonical;
    try { const u = new URL(href); canonical = `${u.origin}${u.pathname}`; } catch { continue; }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const title =
      link.getAttribute('aria-label')?.trim() ||
      link.getAttribute('title')?.trim() ||
      link.querySelector('h1,h2,h3,p,span,div')?.innerText?.trim() ||
      link.innerText?.trim() ||
      `Gemini chat ${threads.length + 1}`;
    threads.push({ url: canonical, title: title.slice(0, 120) });
  }

  // Pass 2 — broad UUID scan (always runs to catch sidebar links regex misses)
  const regexCount = threads.length;
  {
    console.log(`[Brain Shadow] Broad UUID scan...`);
    const SKIP = /\/(login|signup|settings|help|about|privacy|terms|logout|new|upgrade|billing)\b/i;
    for (const link of allLinks) {
      let u; try { u = new URL(link.href); } catch { continue; }
      if (u.origin !== location.origin) continue;
      if (SKIP.test(u.pathname) || u.pathname.length < 4) continue;
      if (!u.pathname.split('/').filter(Boolean).some(s => /^[a-zA-Z0-9_\-]{6,}$/.test(s))) continue;
      const canonical = `${u.origin}${u.pathname}`;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const title = link.getAttribute('aria-label')?.trim() || link.querySelector('span,p,div')?.innerText?.trim() || link.innerText?.trim() || `Chat ${threads.length + 1}`;
      threads.push({ url: canonical, title: title.slice(0, 120) });
    }
    const broadFound = threads.length - regexCount;
    if (broadFound > 0) console.log(`[Brain Shadow] Broad scan found ${broadFound} additional`);
  }

  console.log(`[Brain Shadow] Gemini conversations found: ${threads.length}`);
  return threads;
}

async function scrollSidebarToLoadAll() {
  await new Promise(r => setTimeout(r, 1000));

  const firstLink = Array.from(document.querySelectorAll('a[href]')).find(a => CONV_URL_RE.test(a.href));
  let sidebar = null;

  if (firstLink) {
    let el = firstLink.parentElement;
    while (el && el !== document.documentElement) {
      const s = window.getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
        sidebar = el; break;
      }
      el = el.parentElement;
    }
  }

  if (!sidebar) {
    const sels = ['nav','aside','[role="navigation"]','[aria-label*="history" i]','[aria-label*="chat" i]','[aria-label*="Recent" i]','[class*="nav"]','[class*="menu"]'];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const s = window.getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
          sidebar = el; break;
        }
      }
      if (sidebar) break;
    }
  }

  const target = sidebar || document.documentElement;
  return new Promise((resolve) => {
    let lastH = target.scrollHeight, count = 0;
    const tick = setInterval(() => {
      target.scrollBy(0, target.clientHeight || 500);
      count++;
      const newH = target.scrollHeight;
      if (newH === lastH || count >= 100) {
        clearInterval(tick);
        target.scrollTo(0, 0);
        setTimeout(resolve, 400);
      }
      lastH = newH;
    }, 400);
  });
}

// ── Message listener ───────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeProgress') { showOverlay(request); return; }
  if (request.action === 'scrapeDone')     { removeOverlay();      return; }

  if (request.type === 'GET_SIDEBAR_CHATS') {
    scrollSidebarToLoadAll().then(() => sendResponse(extractRecents()));
    return true;
  }

  if (request.type === 'CAPTURE_CURRENT') {
    captureAndSend(true)
      .then(sendResponse)
      .catch(err => sendResponse({ status: 'error', error: err?.message }));
    return true;
  }

  if (request.type === 'PING') {
    const count = document.querySelectorAll(USER_SEL.concat(ASST_SEL).join(',')).length;
    sendResponse({ pong: true, messageCount: count });
    return true;
  }
});

// ── Boot ───────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForChatAndObserve);
} else {
  waitForChatAndObserve();
}
