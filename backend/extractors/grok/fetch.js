/**
 * Brain Shadow — Grok Content Script
 *
 * Targets: https://grok.com  and  https://x.com/i/grok
 * Architecture matches ChatGPT extractor.
 */

const PLATFORM = 'grok';

// Grok conversation URLs: /chat/[id] or /c/[id] on grok.com
// On x.com: /i/grok/conversation/[id]
const CONV_URL_RE = /\/(?:chat|c|conversation|conversations)\/([a-zA-Z0-9_\-]{4,})/;

const STREAMING_INDICATORS = [
  'button[aria-label="Stop generating"]',
  'button[aria-label="Stop"]',
  '[data-testid="stop-button"]',
  '[class*="StopButton"]',
  '[class*="stop-button"]',
  '[class*="loading"]',
  '[class*="thinking"]',
  '[class*="streaming"]',
];

// ── Streaming guard ────────────────────────────────────────
function isStreaming() {
  return STREAMING_INDICATORS.some(sel => document.querySelector(sel) !== null);
}

function waitForStreamingToFinish() {
  return new Promise((resolve) => {
    if (!isStreaming()) { resolve(); return; }
    console.log('[Brain Shadow] Waiting for Grok to finish…');
    const hard = setTimeout(resolve, 90_000);
    const poll = setInterval(() => {
      if (!isStreaming()) { clearInterval(poll); clearTimeout(hard); setTimeout(resolve, 800); }
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
        'background:linear-gradient(135deg,#1d9bf0,#0a66c2)',
        'color:#fff','padding:12px 20px','border-radius:8px',
        'font-family:-apple-system,sans-serif','font-size:13px',
        'font-weight:500','z-index:999999',
        'box-shadow:0 4px 12px rgba(0,0,0,.3)','max-width:300px',
      ].join(';');
      document.body.appendChild(overlayEl);
    }
    const pct = data.percentage || 0;
    overlayEl.innerHTML = `
      <div style="margin-bottom:8px"><strong>𝕏 Brain Shadow — Grok</strong></div>
      <div style="font-size:12px;margin-bottom:6px">${data.current||0} / ${data.total||0} chats</div>
      <div style="width:260px;height:4px;background:rgba(255,255,255,.3);border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#71d9ff;border-radius:2px"></div>
      </div>
      <div style="font-size:11px;margin-top:6px;color:rgba(255,255,255,.8)">${pct}% — ${data.title||'…'}</div>
    `;
  } catch {}
}

function removeOverlay() { overlayEl?.remove(); overlayEl = null; }

// ── Scroll conversation container ──────────────────────────
function getConversationContainer() {
  const anchor = document.querySelector('[class*="message"],[class*="Message"],[class*="chat"],[class*="Chat"]');
  if (anchor) {
    let el = anchor.parentElement;
    while (el && el !== document.documentElement) {
      const s = window.getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) return el;
      el = el.parentElement;
    }
  }
  return document.documentElement;
}

function scrollToLoadAllMessages() {
  return new Promise((resolve) => {
    const c = getConversationContainer();
    c.scrollTop = 0;
    let pos = 0;
    const step = Math.max(300, Math.floor((c.clientHeight || 600) * 0.75));
    const tick = () => { pos += step; c.scrollTop = pos; setTimeout(() => { pos < c.scrollHeight ? tick() : resolve(); }, 500); };
    setTimeout(tick, 400);
    setTimeout(resolve, 30_000);
  });
}

// ── Helpers ────────────────────────────────────────────────
function deduplicateConsecutiveRoles(messages) {
  if (!messages.length) return messages;
  const out = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = out[out.length - 1];
    if (messages[i].role === prev.role) { if (messages[i].content.length > prev.content.length) out[out.length - 1] = messages[i]; }
    else out.push(messages[i]);
  }
  return out;
}

function assignRelativeTimestamps(messages) {
  const now = Date.now(), STEP = 1000;
  return messages.map((msg, i) => ({ ...msg, index: i, timestamp: new Date(now - (messages.length - 1 - i) * STEP).toISOString() }));
}

function extractGrokId(url) {
  try {
    const m = new URL(url).pathname.match(CONV_URL_RE);
    return m ? m[1] : new URL(url).pathname.split('/').filter(Boolean).pop() || url;
  } catch { return url; }
}

// ── Core scraper ───────────────────────────────────────────
function scrapeConversation() {
  const USER_SEL = [
    '[data-testid*="user-message"]',  '[data-testid*="human"]',
    '[class*="UserMessage"]',          '[class*="user-message"]',
    '[class*="HumanMessage"]',         '[class*="human-message"]',
    '[class*="userBubble"]',           '[class*="UserBubble"]',
    '[data-message-author-role="user"]',
  ];
  const ASST_SEL = [
    '[data-testid*="grok-message"]',   '[data-testid*="assistant"]',
    '[class*="GrokMessage"]',          '[class*="grok-message"]',
    '[class*="AssistantMessage"]',     '[class*="assistant-message"]',
    '[class*="BotMessage"]',           '[class*="bot-message"]',
    '[class*="markdown"]',             '[class*="MarkdownContent"]',
    '[data-message-author-role="assistant"]',
  ];

  let userEls = [], asstEls = [];
  for (const sel of USER_SEL) { const f = [...document.querySelectorAll(sel)]; if (f.length) { userEls = f; break; } }
  for (const sel of ASST_SEL) { const f = [...document.querySelectorAll(sel)]; if (f.length) { asstEls = f; break; } }

  // Container fallback
  if (!userEls.length && !asstEls.length) {
    for (const sel of ['[class*="chatContent"]','[class*="messageList"]','[class*="conversation"]','main']) {
      const c = document.querySelector(sel);
      if (!c) continue;
      const children = [...c.children].filter(el => el.innerText?.trim().length > 3);
      if (children.length >= 2) { children.forEach((el, i) => (i % 2 === 0 ? userEls : asstEls).push(el)); break; }
    }
  }

  if (!userEls.length && !asstEls.length) return null;

  const allItems = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...asstEls.map(el => ({ el, role: 'assistant' })),
  ].sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

  let messages = allItems
    .map(({ el, role }) => { const content = el.innerText?.trim(); return content && content.length > 3 ? { role, content } : null; })
    .filter(Boolean);

  messages = deduplicateConsecutiveRoles(messages);
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  messages = assignRelativeTimestamps(messages);

  const external_id = extractGrokId(location.href);
  const title = document.title?.replace(' | Grok', '').replace(' - Grok', '').trim() || external_id;

  console.log(`[Brain Shadow] Grok scraped: ${messages.length} messages — "${title}"`);
  return { platform: PLATFORM, external_id, url: location.href, title, message_count: messages.length, messages, captured_at: new Date().toISOString() };
}

// ── Capture pipeline ───────────────────────────────────────
let isCapturing = false;

async function captureAndSend() {
  if (isCapturing) return { status: 'busy' };
  isCapturing = true;
  try {
    await waitForStreamingToFinish();
    await scrollToLoadAllMessages();
    const conversation = scrapeConversation();
    if (!conversation) return { status: 'empty' };
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'SAVE_CONVERSATION', payload: conversation },
        (r) => resolve(chrome.runtime.lastError ? { status: 'error' } : (r || { status: 'unknown' })));
    });
    return { ...result, title: conversation.title, message_count: conversation.messages.length };
  } finally { isCapturing = false; }
}

// ── MutationObserver ───────────────────────────────────────
let debounceTimer = null;
const observer = new MutationObserver(() => { clearTimeout(debounceTimer); debounceTimer = setTimeout(captureAndSend, 3000); });

function waitForChatAndObserve() {
  observer.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
  console.log('[Brain Shadow] Observer attached (Grok)');
  setTimeout(captureAndSend, 3500);
}

// ── SPA navigation watcher ─────────────────────────────────
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(captureAndSend, 4000); }
}).observe(document, { subtree: true, childList: true });

// ── Sidebar ────────────────────────────────────────────────
function extractRecents() {
  const allLinks = Array.from(document.querySelectorAll('a[href]'));
  console.log(`[Brain Shadow] Grok <a> tags: ${allLinks.length}`);
  console.log('[Brain Shadow] ALL hrefs:\n' + [...new Set(allLinks.map(a => a.getAttribute('href')))].slice(0, 50).join('\n'));

  const seen = new Set(), threads = [];

  // Pass 1 — primary regex
  for (const link of allLinks) {
    const href = link.href || '';
    if (!CONV_URL_RE.test(href)) continue;
    let canonical; try { const u = new URL(href); canonical = `${u.origin}${u.pathname}`; } catch { continue; }
    if (seen.has(canonical)) continue; seen.add(canonical);
    const title =
      link.getAttribute('aria-label')?.trim() ||
      link.getAttribute('title')?.trim() ||
      link.querySelector('span,p,div')?.innerText?.trim() ||
      link.innerText?.trim() ||
      `Grok chat ${threads.length + 1}`;
    threads.push({ url: canonical, title: title.slice(0, 120) });
  }

  // Pass 2 — broad UUID fallback
  if (threads.length === 0) {
    console.warn('[Brain Shadow] Regex matched 0 — trying broad UUID scan');
    const SKIP = /\/(login|signup|settings|help|about|privacy|terms|logout|new|upgrade|i\/flow|home|explore|notifications)\b/i;
    for (const link of allLinks) {
      let u; try { u = new URL(link.href); } catch { continue; }
      if (u.origin !== location.origin) continue;
      if (SKIP.test(u.pathname) || u.pathname.length < 4) continue;
      const segs = u.pathname.split('/').filter(Boolean);
      if (!segs.some(s => /^[a-zA-Z0-9_\-]{8,}$/.test(s))) continue;
      const canonical = `${u.origin}${u.pathname}`;
      if (seen.has(canonical)) continue; seen.add(canonical);
      const title = link.getAttribute('aria-label')?.trim() || link.innerText?.trim() || `Chat ${threads.length + 1}`;
      threads.push({ url: canonical, title: title.slice(0, 120) });
    }
    if (threads.length > 0) console.log(`[Brain Shadow] Broad scan found ${threads.length} — update CONV_URL_RE`);
  }

  if (threads.length === 0) console.warn('[Brain Shadow] 0 conversations — check ALL hrefs above');
  console.log(`[Brain Shadow] Grok conversations: ${threads.length}`);
  return threads;
}

async function scrollSidebarToLoadAll() {
  await new Promise(r => setTimeout(r, 1500));
  let sidebar = null;
  const firstLink = [...document.querySelectorAll('a[href]')].find(a => CONV_URL_RE.test(a.href));
  if (firstLink) {
    let el = firstLink.parentElement;
    while (el && el !== document.documentElement) {
      const s = window.getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) { sidebar = el; break; }
      el = el.parentElement;
    }
  }
  if (!sidebar) {
    for (const sel of ['nav','aside','[role="navigation"]','[class*="sidebar"]','[class*="Sidebar"]','[class*="history"]','[class*="chatList"]']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const s = window.getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) { sidebar = el; break; }
    }
  }
  const target = sidebar || document.documentElement;
  return new Promise((resolve) => {
    let lastH = target.scrollHeight, count = 0;
    const tick = setInterval(() => {
      target.scrollBy(0, target.clientHeight || 500); count++;
      const newH = target.scrollHeight;
      if (newH === lastH || count >= 80) { clearInterval(tick); target.scrollTo(0, 0); setTimeout(resolve, 400); }
      lastH = newH;
    }, 400);
  });
}

// ── Message listener ───────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SIDEBAR_CHATS') {
    scrollSidebarToLoadAll().then(() => sendResponse(extractRecents()));
    return true;
  }
  if (request.type === 'CAPTURE_CURRENT') {
    captureAndSend().then(sendResponse).catch(err => sendResponse({ status: 'error', error: err?.message }));
    return true;
  }
  if (request.type === 'PING') {
    const count = document.querySelectorAll('[class*="message"],[class*="Message"],[class*="chat"],[class*="Chat"]').length;
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
