/**
 * Brain Shadow — Claude Content Script v2
 *
 * Architecture matches ChatGPT extractor:
 *  - Streaming guard, MutationObserver, SPA watcher
 *  - CAPTURE_CURRENT / PING / GET_SIDEBAR_CHATS handlers
 *  - Messages: { role, content, index, timestamp }
 */

const PLATFORM    = 'claude';
const CONV_URL_RE = /\/(?:chat|c|conversation)\/([a-zA-Z0-9_\-]{4,})/;

// Claude streaming indicators
const STREAMING_INDICATORS = [
  'button[aria-label="Stop generating"]',
  'button[aria-label="Stop response"]',
  '[data-testid="stop-button"]',
  '[aria-label*="Stop" i]',
  '.stop-button',
  '[class*="stop-button"]',
];

// ── Streaming guard ────────────────────────────────────────
function isStreaming() {
  return STREAMING_INDICATORS.some(sel => document.querySelector(sel) !== null);
}

function waitForStreamingToFinish() {
  return new Promise((resolve) => {
    if (!isStreaming()) { resolve(); return; }
    console.log('[Brain Shadow] Waiting for Claude to finish streaming…');
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
        'background:linear-gradient(135deg,#e06b42,#7a2e12)',
        'color:#fff','padding:12px 20px','border-radius:8px',
        'font-family:-apple-system,sans-serif','font-size:13px',
        'font-weight:500','z-index:999999',
        'box-shadow:0 4px 12px rgba(0,0,0,.3)','max-width:300px',
      ].join(';');
      document.body.appendChild(overlayEl);
    }
    const pct = data.percentage || 0;
    overlayEl.innerHTML = `
      <div style="margin-bottom:8px"><strong>🧠 Brain Shadow — Claude</strong></div>
      <div style="font-size:12px;margin-bottom:6px">${data.current||0} / ${data.total||0} chats</div>
      <div style="width:260px;height:4px;background:rgba(255,255,255,.3);border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#f0956d;border-radius:2px"></div>
      </div>
      <div style="font-size:11px;margin-top:6px;color:rgba(255,255,255,.8)">${pct}% — ${data.title||'…'}</div>
    `;
  } catch {}
}

function removeOverlay() { overlayEl?.remove(); overlayEl = null; }

// ── Scroll conversation to load all messages ───────────────
function getConversationContainer() {
  const selectors = ['main','[role="main"]','.chat-main','.conversation'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const s = window.getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) return el;
  }
  // Walk up from first message element
  const anchor = document.querySelector('[data-testid^="message"],[class*="message"]');
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
function normalizeText(text) { return text?.replace(/\s+/g, ' ').trim() || ''; }

function detectRole(node) {
  const text = [
    node.getAttribute('data-testid') || '',
    node.getAttribute('aria-label') || '',
    node.className || '',
  ].join(' ').toLowerCase();

  if (text.includes('human') || text.includes('user')) return 'user';
  if (text.includes('assistant') || text.includes('response') || text.includes('ai')) return 'assistant';
  return 'assistant';
}

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

function extractClaudeId(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const idx   = parts.findIndex(p => ['chat','c','conversation'].includes(p));
    return idx !== -1 && parts[idx + 1] ? parts[idx + 1] : parts[parts.length - 1];
  } catch { return url; }
}

// ── Core scraper ───────────────────────────────────────────
function scrapeConversation() {
  const root = document.querySelector('main,[role="main"],.chat-main') || document.body;

  const selectors = [
    '[data-testid^="message"]',
    '[data-testid*="human"]',
    '[data-testid*="assistant"]',
    '[class*="message"]',
    '[class*="bubble"]',
    '[role="listitem"]',
    'article',
  ];

  const nodes = new Set();
  selectors.forEach(sel => {
    root.querySelectorAll(sel).forEach(node => {
      if (node.innerText && normalizeText(node.innerText).length >= 10) nodes.add(node);
    });
  });

  if (nodes.size === 0) {
    root.querySelectorAll('div,li,article').forEach(node => {
      if (!node.innerText) return;
      const text = normalizeText(node.innerText);
      if (text.length < 20 || node.children.length >= 10) return;
      const s = window.getComputedStyle(node);
      if (s.display === 'none' || s.visibility === 'hidden') return;
      nodes.add(node);
    });
  }

  let messages = Array.from(nodes)
    .map(node => {
      const content = normalizeText(node.innerText);
      if (!content || content.length < 5) return null;
      return { role: detectRole(node), content };
    })
    .filter(Boolean);

  messages = deduplicateConsecutiveRoles(messages);

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') {
    console.log('[Brain Shadow] Claude: conversation incomplete — skipping');
    return null;
  }

  messages = assignRelativeTimestamps(messages);

  const external_id = extractClaudeId(location.href);
  const title = document.title?.replace(' - Claude', '').replace(' | Claude', '').trim() || external_id;

  console.log(`[Brain Shadow] Claude scraped: ${messages.length} messages — "${title}"`);
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
  console.log('[Brain Shadow] Observer attached (Claude)');
  setTimeout(captureAndSend, 3500);
}

// ── SPA navigation watcher ─────────────────────────────────
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(captureAndSend, 4000); }
}).observe(document, { subtree: true, childList: true });

// ── Sidebar: get conversation list ────────────────────────
function extractRecents() {
  const allLinks = Array.from(document.querySelectorAll('a[href]'));
  console.log(`[Brain Shadow] Claude <a> tags: ${allLinks.length}`);
  console.log('[Brain Shadow] ALL hrefs:\n' + [...new Set(allLinks.map(a => a.getAttribute('href')))].slice(0, 50).join('\n'));

  const seen = new Set(), threads = [];

  // Pass 1 — primary regex
  for (const link of allLinks) {
    const href = link.href || '';
    if (!href.includes('claude.ai')) continue;
    if (/\/(recents|settings|help|login|mailto:|new)/.test(href)) continue;
    if (!CONV_URL_RE.test(href)) continue;
    let canonical;
    try { const u = new URL(href); canonical = `${u.origin}${u.pathname}`; } catch { continue; }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const title = normalizeText(link.innerText || link.getAttribute('aria-label') || '') ||
      normalizeText(link.querySelector('div,span,h2,h3,p')?.innerText || '') ||
      `Claude chat ${threads.length + 1}`;
    if (title.length < 2) continue;
    threads.push({ url: canonical, title: title.slice(0, 120) });
  }

  // Pass 2 — broad UUID fallback
  if (threads.length === 0) {
    console.warn('[Brain Shadow] Regex matched 0 — trying broad UUID scan');
    const SKIP = /\/(login|signup|settings|help|about|privacy|terms|logout|new|upgrade|recents)\b/i;
    for (const link of allLinks) {
      let u; try { u = new URL(link.href); } catch { continue; }
      if (u.origin !== location.origin) continue;
      if (SKIP.test(u.pathname) || u.pathname.length < 4) continue;
      const segs = u.pathname.split('/').filter(Boolean);
      if (!segs.some(s => /^[a-zA-Z0-9_\-]{8,}$/.test(s))) continue;
      const canonical = `${u.origin}${u.pathname}`;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const title = normalizeText(link.innerText || link.getAttribute('aria-label') || '') || `Chat ${threads.length + 1}`;
      threads.push({ url: canonical, title: title.slice(0, 120) });
    }
    if (threads.length > 0) console.log(`[Brain Shadow] Broad scan found ${threads.length} — update CONV_URL_RE`);
  }

  console.log(`[Brain Shadow] Claude conversations found: ${threads.length}`);
  return threads;
}

async function scrollSidebarToLoadAll() {
  await new Promise(r => setTimeout(r, 1000));

  let sidebar = null;
  const firstLink = [...document.querySelectorAll('a[href]')].find(a => CONV_URL_RE.test(a.href) && a.href.includes('claude.ai'));
  if (firstLink) {
    let el = firstLink.parentElement;
    while (el && el !== document.documentElement) {
      const s = window.getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) { sidebar = el; break; }
      el = el.parentElement;
    }
  }

  if (!sidebar) {
    for (const sel of ['nav','aside','[role="navigation"]','[class*="sidebar"]','[class*="history"]','[class*="recents"]']) {
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
    }, 350);
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
    captureAndSend().then(sendResponse).catch(err => sendResponse({ status: 'error', error: err?.message }));
    return true;
  }
  if (request.type === 'PING') {
    const count = document.querySelectorAll('[data-testid^="message"],[class*="message"]').length;
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
