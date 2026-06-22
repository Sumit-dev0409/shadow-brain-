// ============================================================
// Brain Shadow — Gemini Content Script
//
// Handles two actions triggered by popup.js:
//   extractRecents     → scroll sidebar, return all conversation links
//   extractConversation → scrape messages from the current chat page
// ============================================================

const PLATFORM = 'gemini';

// ── Overlay ────────────────────────────────────────────────
let overlayEl = null;

function showOverlay(data) {
  try {
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'bs-gemini-overlay';
      overlayEl.style.cssText = `
        position:fixed; top:10px; right:10px;
        background:linear-gradient(135deg,#1a73e8,#0d47a1);
        color:#fff; padding:12px 20px; border-radius:8px;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        font-size:13px; font-weight:500; z-index:999999;
        box-shadow:0 4px 12px rgba(0,0,0,0.3); max-width:300px;
      `;
      document.body.appendChild(overlayEl);
    }
    const pct = data.percentage || 0;
    overlayEl.innerHTML = `
      <div style="margin-bottom:8px"><strong>🔄 Scanning Gemini</strong></div>
      <div style="font-size:12px;margin-bottom:6px">${data.current||0} / ${data.total||0} chats</div>
      <div style="width:260px;height:4px;background:rgba(255,255,255,.3);border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#4CAF50;border-radius:2px"></div>
      </div>
      <div style="font-size:11px;margin-top:6px;color:rgba(255,255,255,.8)">${pct}% — ${data.title||'Loading…'}</div>
    `;
  } catch (e) {
    console.error('[Brain Shadow] Overlay error:', e);
  }
}

function removeOverlay() {
  overlayEl?.remove();
  overlayEl = null;
}

// ── Message listener ───────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeProgress') { showOverlay(request); return; }
  if (request.action === 'scrapeDone')     { removeOverlay();      return; }

  if (request.action === 'extractRecents') {
    scrollSidebarToLoadAll().then(() => {
      sendResponse(extractRecents());
    });
    return true; // async
  }

  if (request.action === 'extractConversation' || request.action === 'extractCurrent') {
    extractConversation().then((result) => {
      if (request.action === 'extractConversation') {
        chrome.runtime.sendMessage({ action: 'conversationExtracted', data: result });
      }
      sendResponse(result);
    });
    return true; // async
  }
});

// ── Extract conversation list from sidebar ────────────────
function extractRecents() {
  const links = Array.from(document.querySelectorAll('a[href]'));
  const seen  = new Set();
  const threads = [];

  for (const link of links) {
    const href = link.href || '';
    if (!href.includes('gemini.google.com')) continue;
    if (!href.includes('/app/'))             continue;

    // Skip bare /app or /app/ with no id
    try {
      const p = new URL(href).pathname;
      if (p === '/app' || p === '/app/') continue;
    } catch { continue; }

    if (seen.has(href)) continue;
    seen.add(href);

    // Title from link text, aria-label, or child span
    let title =
      link.getAttribute('aria-label')?.trim() ||
      link.querySelector('span, p, div')?.innerText?.trim() ||
      link.innerText?.trim();

    if (!title || title.length < 2) continue;
    threads.push({ url: href, title });
  }

  console.log(`[Brain Shadow] Gemini recents: ${threads.length} threads`);
  return { threads };
}

// ── Scroll the sidebar to load all conversations ──────────
async function scrollSidebarToLoadAll() {
  // Gemini keeps conversation history in a scrollable sidebar nav
  const sidebarSelectors = [
    'nav[aria-label]',
    '[role="navigation"]',
    'c-wiz nav',
    '.conversation-list',
    'div[jsname] nav',
  ];

  let sidebar = null;
  for (const sel of sidebarSelectors) {
    const el = document.querySelector(sel);
    if (el && el.scrollHeight > el.clientHeight + 50) { sidebar = el; break; }
  }

  const target = sidebar || document.documentElement;
  let lastHeight = target.scrollHeight;
  let scrollCount = 0;

  return new Promise((resolve) => {
    const tick = setInterval(() => {
      target.scrollBy(0, target.clientHeight);
      scrollCount++;
      const newH = target.scrollHeight;
      if (newH === lastHeight || scrollCount >= 80) {
        clearInterval(tick);
        target.scrollTo(0, 0);
        resolve();
        return;
      }
      lastHeight = newH;
    }, 350);
  });
}

// ── Scrape messages from a Gemini chat page ───────────────
async function extractConversation() {
  // Gemini uses web components: <user-query> and <model-response>
  // with possible class-based fallbacks for older/updated layouts
  const USER_SEL = [
    'user-query',
    '.user-query',
    '[data-message-author-role="user"]',
    '.user-request-text',
    '.query-text',
  ];
  const ASST_SEL = [
    'model-response',
    '.model-response',
    '[data-message-author-role="model"]',
    '.response-content',
    '.model-response-text',
    'message-content',
  ];

  let userEls = [];
  let asstEls = [];

  for (const sel of USER_SEL) {
    const found = [...document.querySelectorAll(sel)];
    if (found.length) { userEls = found; break; }
  }
  for (const sel of ASST_SEL) {
    const found = [...document.querySelectorAll(sel)];
    if (found.length) { asstEls = found; break; }
  }

  // Generic fallback: scan visible blocks with substantial text
  if (userEls.length === 0 && asstEls.length === 0) {
    console.warn('[Brain Shadow] Primary selectors found nothing — using fallback');
    const blocks = [...document.querySelectorAll('div, article, section')].filter(el => {
      const t = el.innerText?.trim();
      return t && t.length > 30 && el.children.length < 8 &&
             getComputedStyle(el).display !== 'none';
    });
    // Heuristic: alternate user/assistant by position
    blocks.forEach((el, i) => {
      const role = i % 2 === 0 ? 'user' : 'assistant';
      (role === 'user' ? userEls : asstEls).push(el);
    });
  }

  // Sort all elements by DOM order
  const allItems = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...asstEls.map(el => ({ el, role: 'assistant' })),
  ].sort((a, b) => {
    const bit = a.el.compareDocumentPosition(b.el);
    return bit & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const messages = allItems
    .map(({ el, role }) => {
      const text = el.innerText?.trim();
      return text && text.length > 3 ? { role, text, uniqueKey: `${window.location.pathname}|${text}` } : null;
    })
    .filter(Boolean);

  // Merge consecutive same-role duplicates (keep longer)
  const deduped = [];
  for (const msg of messages) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.role === msg.role) {
      if (msg.text.length > prev.text.length) deduped[deduped.length - 1] = msg;
    } else {
      deduped.push(msg);
    }
  }

  console.log(`[Brain Shadow] Gemini extracted ${deduped.length} messages`);
  return { total: deduped.length, newCount: deduped.length, newMessages: deduped };
}
