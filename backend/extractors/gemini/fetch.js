// ============================================================
// Brain Shadow — Gemini Content Script v2
//
// FIX 1: extractRecents — removed strict title filter that
//         silently dropped all Angular-rendered sidebar items.
//         Falls back to generic title instead of skipping.
// FIX 2: extractRecents — broadened URL pattern to catch both
//         /app/[id] and any future /c/[id] format.
// FIX 3: scrollSidebarToLoadAll — now walks up the DOM from the
//         first conversation link to find the actual scrollable
//         sidebar container instead of guessing with selectors.
// FIX 4: extractConversation — also tries innerText of shadow-
//         pierced children via deep querySelector fallbacks.
// ============================================================

const PLATFORM = 'gemini';

// Matches /app/[id] where id is at least 4 alphanumeric chars
const CONV_URL_RE = /\/app\/([a-zA-Z0-9_\-]{4,})/;

// ── Overlay ────────────────────────────────────────────────
let overlayEl = null;

function showOverlay(data) {
  try {
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'bs-gemini-overlay';
      overlayEl.style.cssText = [
        'position:fixed', 'top:10px', 'right:10px',
        'background:linear-gradient(135deg,#1a73e8,#0d47a1)',
        'color:#fff', 'padding:12px 20px', 'border-radius:8px',
        'font-family:-apple-system,sans-serif', 'font-size:13px',
        'font-weight:500', 'z-index:999999',
        'box-shadow:0 4px 12px rgba(0,0,0,.3)', 'max-width:300px',
      ].join(';');
      document.body.appendChild(overlayEl);
    }
    const pct = data.percentage || 0;
    overlayEl.innerHTML = `
      <div style="margin-bottom:8px"><strong>🔄 Scanning Gemini</strong></div>
      <div style="font-size:12px;margin-bottom:6px">${data.current||0} / ${data.total||0} chats</div>
      <div style="width:260px;height:4px;background:rgba(255,255,255,.3);border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#4CAF50;border-radius:2px"></div>
      </div>
      <div style="font-size:11px;margin-top:6px;color:rgba(255,255,255,.8)">${pct}% — ${data.title||'…'}</div>
    `;
  } catch (e) {
    console.error('[Brain Shadow] Overlay error:', e);
  }
}

function removeOverlay() { overlayEl?.remove(); overlayEl = null; }

// ── Message listener ───────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeProgress') { showOverlay(request); return; }
  if (request.action === 'scrapeDone')     { removeOverlay();      return; }

  if (request.action === 'extractRecents') {
    scrollSidebarToLoadAll().then(() => {
      sendResponse(extractRecents());
    });
    return true;
  }

  if (request.action === 'extractConversation' || request.action === 'extractCurrent') {
    extractConversation().then((result) => {
      if (request.action === 'extractConversation') {
        chrome.runtime.sendMessage({ action: 'conversationExtracted', data: result });
      }
      sendResponse(result);
    });
    return true;
  }
});

// ── FIX 1 & 2: Extract sidebar conversation list ──────────
function extractRecents() {
  const allLinks = Array.from(document.querySelectorAll('a[href]'));

  // Debug: log what we see so the user can inspect the console
  console.log(`[Brain Shadow] Total <a> tags on page: ${allLinks.length}`);
  const sampleHrefs = allLinks.slice(0, 15).map(a => a.href);
  console.log('[Brain Shadow] Sample hrefs:', sampleHrefs);

  const seen    = new Set();
  const threads = [];

  for (const link of allLinks) {
    const href = link.href || '';

    // Must be a Gemini conversation URL — matches /app/[id]
    if (!CONV_URL_RE.test(href)) continue;

    // Normalise to origin + pathname (drop query string / hash)
    let canonical;
    try {
      const u   = new URL(href);
      canonical = `${u.origin}${u.pathname}`;
    } catch { continue; }

    if (seen.has(canonical)) continue;
    seen.add(canonical);

    // FIX 1: Try every possible title source; NEVER skip just because
    //         text is missing — Angular may render it hidden.
    const title =
      link.getAttribute('aria-label')?.trim()                              ||
      link.getAttribute('title')?.trim()                                   ||
      link.querySelector('h1,h2,h3,p,span,div')?.innerText?.trim()        ||
      link.innerText?.trim()                                               ||
      `Gemini chat ${threads.length + 1}`;      // fallback — never empty

    threads.push({ url: canonical, title: title.slice(0, 120) });
  }

  console.log(`[Brain Shadow] Gemini conversations found: ${threads.length}`);
  if (threads.length === 0) {
    console.warn(
      '[Brain Shadow] 0 results — check console for sample hrefs above.',
      'If sidebar links don\'t contain /app/[id], open an issue.'
    );
  }

  return { threads };
}

// ── FIX 3: Scroll the correct sidebar container ───────────
async function scrollSidebarToLoadAll() {
  // Give Angular a moment to render conversation list
  await new Promise(r => setTimeout(r, 1000));

  // Strategy 1: walk up from the first conversation link to find
  //             its nearest scrollable ancestor (the sidebar panel)
  const firstLink = Array.from(document.querySelectorAll('a[href]'))
    .find(a => CONV_URL_RE.test(a.href));

  let sidebar = null;

  if (firstLink) {
    let el = firstLink.parentElement;
    while (el && el !== document.documentElement) {
      const s = window.getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 20) {
        sidebar = el;
        break;
      }
      el = el.parentElement;
    }
  }

  // Strategy 2: common sidebar element names / roles
  if (!sidebar) {
    for (const sel of [
      'nav', 'aside',
      '[role="navigation"]', '[role="complementary"]',
      '[aria-label*="conversation" i]', '[aria-label*="history" i]',
      '[aria-label*="chat" i]',
    ]) {
      const el = document.querySelector(sel);
      if (el) {
        const s = window.getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 20) {
          sidebar = el;
          break;
        }
      }
    }
  }

  const target = sidebar || document.documentElement;
  console.log(
    '[Brain Shadow] Scroll target:',
    target.tagName,
    (target.className || '').toString().slice(0, 60)
  );

  return new Promise((resolve) => {
    let lastHeight = target.scrollHeight;
    let count      = 0;

    const tick = setInterval(() => {
      target.scrollBy(0, target.clientHeight || 500);
      count++;
      const newH = target.scrollHeight;

      if (newH === lastHeight || count >= 80) {
        clearInterval(tick);
        target.scrollTo(0, 0);
        setTimeout(resolve, 400);
        return;
      }
      lastHeight = newH;
    }, 400);
  });
}

// ── FIX 4: Scrape messages from a Gemini conversation ─────
async function extractConversation() {
  const USER_SEL = [
    'user-query',
    '.user-query',
    '[data-message-author-role="user"]',
    '.user-request-text',
    '.query-text',
    '[class*="user-query"]',
    '[class*="human-turn"]',
  ];
  const ASST_SEL = [
    'model-response',
    '.model-response',
    '[data-message-author-role="model"]',
    '.response-content',
    '.model-response-text',
    'message-content',
    '[class*="model-response"]',
    '[class*="ai-turn"]',
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

  // Generic fallback: visible leaf-ish blocks with substantial text
  if (userEls.length === 0 && asstEls.length === 0) {
    console.warn('[Brain Shadow] No message elements found — using text-block fallback');
    const blocks = [...document.querySelectorAll('div, article, section, p')].filter(el => {
      const t = el.innerText?.trim() || '';
      return (
        t.length > 20 &&
        el.children.length < 6 &&
        window.getComputedStyle(el).display !== 'none' &&
        window.getComputedStyle(el).visibility !== 'hidden'
      );
    });
    blocks.forEach((el, i) => {
      (i % 2 === 0 ? userEls : asstEls).push(el);
    });
  }

  const allItems = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...asstEls.map(el => ({ el, role: 'assistant' })),
  ].sort((a, b) =>
    a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );

  const messages = allItems
    .map(({ el, role }) => {
      const text = el.innerText?.trim();
      return text && text.length > 3
        ? { role, text, uniqueKey: `${location.pathname}|${text.slice(0, 60)}` }
        : null;
    })
    .filter(Boolean);

  // Merge consecutive same-role blocks
  const deduped = [];
  for (const msg of messages) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.role === msg.role) {
      if (msg.text.length > prev.text.length) deduped[deduped.length - 1] = msg;
    } else {
      deduped.push(msg);
    }
  }

  console.log(`[Brain Shadow] Gemini messages extracted: ${deduped.length}`);
  return { total: deduped.length, newCount: deduped.length, newMessages: deduped };
}
