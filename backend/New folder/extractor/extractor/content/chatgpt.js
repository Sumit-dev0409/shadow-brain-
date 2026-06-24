/**
 * Brain Shadow — ChatGPT Content Script v6
 *
 * FIXES IN THIS VERSION:
 * ─────────────────────────────────────────────────────────────
 * FIX 1 — Streaming detection (premature capture)
 *   Root cause: Observer fired mid-stream while ChatGPT was still
 *   typing. We now detect the "Stop generating" button and the
 *   streaming cursor element; capture is deferred until both are gone.
 *
 * FIX 2 — Per-message relative timestamps
 *   Root cause: Every message got the same capture timestamp.
 *   We now assign an index-based relative offset so messages are
 *   correctly ordered, and store a `index` field for ordering.
 *   True per-message timestamps aren't in ChatGPT DOM; this is
 *   the most accurate approach possible without the API.
 *
 * FIX 3 — Consecutive same-role message deduplication
 *   Root cause: Scraper ran mid-regeneration and captured two
 *   assistant messages in a row, or two user messages with no reply.
 *   We now merge consecutive same-role messages into one, and
 *   require at least one assistant reply before saving.
 *
 * FIX 4 — Validate conversation completeness before saving
 *   Root cause: Incomplete conversations (only user, no reply) were
 *   saved to storage. We now require lastMessage.role === 'assistant'.
 * ─────────────────────────────────────────────────────────────
 */

// ─── Selectors ────────────────────────────────────────────────────────────────
const MSG_SEL = '[data-message-author-role]';
const ROLE_ATTR = 'data-message-author-role';
const PROSE_SEL = '.markdown, [class*="prose"], .whitespace-pre-wrap';

// FIX 1: Elements that indicate streaming is still in progress
const STREAMING_INDICATORS = [
  'button[data-testid="stop-button"]',          // "Stop generating" button
  'button[aria-label="Stop generating"]',        // aria variant
  '[data-testid="stop-button"]',
  '.result-streaming',                           // streaming cursor class
  '[class*="result-streaming"]',
];
// ─────────────────────────────────────────────────────────────────────────────

// ─── FIX 1: Streaming guard ───────────────────────────────────────────────────
function isStreaming() {
  return STREAMING_INDICATORS.some(sel => document.querySelector(sel) !== null);
}

/**
 * Wait until ChatGPT finishes streaming.
 * Polls every 500ms; resolves when all streaming indicators are gone.
 * Hard timeout: 90s (for very long responses).
 */
function waitForStreamingToFinish() {
  return new Promise((resolve) => {
    if (!isStreaming()) { resolve(); return; }

    console.log('[Brain Shadow] Waiting for streaming to finish…');
    const hardTimeout = setTimeout(resolve, 90_000);

    const poll = setInterval(() => {
      if (!isStreaming()) {
        clearInterval(poll);
        clearTimeout(hardTimeout);
        console.log('[Brain Shadow] Streaming finished.');
        // Extra 800ms grace — DOM settles after cursor disappears
        setTimeout(resolve, 800);
      }
    }, 500);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Scroll container ─────────────────────────────────────────────────────────
function getScrollContainer() {
  const anchor = document.querySelector(MSG_SEL);
  if (!anchor) return null;

  let el = anchor.parentElement;
  while (el && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const canScroll = style.overflowY === 'auto' || style.overflowY === 'scroll';
    const hasRoom = el.scrollHeight > el.clientHeight + 50;
    if (canScroll && hasRoom) {
      console.log('[Brain Shadow] Scroll container:', el.tagName, el.className?.slice(0, 60));
      return el;
    }
    el = el.parentElement;
  }
  return document.documentElement;
}

function scrollToLoadAllMessages() {
  return new Promise((resolve) => {
    const container = getScrollContainer();
    if (!container) { resolve(); return; }

    const saved = container.scrollTop;
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        container.scrollTop = saved;
        console.log('[Brain Shadow] Scroll complete');
        resolve();
      }
    };

    setTimeout(done, 30_000); // hard timeout

    container.scrollTop = 0;
    setTimeout(() => {
      const step = Math.max(300, Math.floor(container.clientHeight * 0.75));
      let pos = 0;
      const tick = () => {
        pos += step;
        container.scrollTop = pos;
        setTimeout(() => {
          pos < container.scrollHeight ? tick() : done();
        }, 600);
      };
      tick();
    }, 500);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Text extraction ──────────────────────────────────────────────────────────
function extractText(el, role) {
  const imgs = el.querySelectorAll('img');
  if (imgs.length > 0 && !el.querySelector(PROSE_SEL)) {
    const alts = Array.from(imgs).map(i => i.alt).filter(Boolean);
    return alts.length
      ? `[Image generated by ChatGPT: ${alts.join(', ')}]`
      : '[Image generated by ChatGPT]';
  }

  const prose = el.querySelector(PROSE_SEL);
  if (prose?.innerText?.trim()) return prose.innerText.trim();

  const raw = el.innerText.trim();
  if (raw) return raw;

  if (role === 'assistant') {
    console.warn('[Brain Shadow] Empty assistant node — image or special content', el);
    return '[Response not captured — may be image or special content]';
  }
  return null;
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── FIX 3: Merge consecutive same-role messages ──────────────────────────────
/**
 * If the scraper catches a regeneration mid-flight, you can get:
 *   user → assistant → assistant (duplicate/regenerated)
 * or from bulk scroll:
 *   user → user → assistant
 * We merge consecutive same-role blocks into one message,
 * keeping the content of the LAST one (most complete version).
 */
function deduplicateConsecutiveRoles(messages) {
  if (!messages.length) return messages;

  const deduped = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = messages[i];
    if (curr.role === prev.role) {
      // Keep the longer / more complete content
      if (curr.content.length > prev.content.length) {
        deduped[deduped.length - 1] = curr;
      }
      console.log(`[Brain Shadow] Merged consecutive ${curr.role} messages`);
    } else {
      deduped.push(curr);
    }
  }
  return deduped;
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── FIX 2: Per-message relative timestamps ───────────────────────────────────
/**
 * ChatGPT DOM doesn't expose real send times.
 * We assign a synthetic timestamp per message using the capture base time
 * minus an offset proportional to position — so messages are correctly
 * ordered in any downstream system that sorts by timestamp.
 *
 * Example for a 4-message conversation captured at T:
 *   msg[0] → T - 3000ms  (oldest)
 *   msg[1] → T - 2000ms
 *   msg[2] → T - 1000ms
 *   msg[3] → T           (most recent)
 */
function assignRelativeTimestamps(messages) {
  const now = Date.now();
  const total = messages.length;
  const STEP_MS = 1000; // 1 second apart

  return messages.map((msg, i) => ({
    ...msg,
    index: i,
    timestamp: new Date(now - (total - 1 - i) * STEP_MS).toISOString(),
  }));
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Core scraper ─────────────────────────────────────────────────────────────
function scrapeConversation() {
  const messageEls = Array.from(document.querySelectorAll(MSG_SEL));
  console.log(`[Brain Shadow] ${messageEls.length} message nodes in DOM`);
  if (messageEls.length === 0) return null;

  let messages = messageEls
    .map(el => {
      const role = el.getAttribute(ROLE_ATTR);
      const content = extractText(el, role);
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean);

  // FIX 3: Merge consecutive same-role messages
  messages = deduplicateConsecutiveRoles(messages);

  // FIX 4: Require at least one assistant reply — never save incomplete turns
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'assistant') {
    console.log('[Brain Shadow] Last message is not from assistant — skipping capture (conversation incomplete)');
    return null;
  }

  // FIX 2: Assign relative timestamps so messages are orderable
  messages = assignRelativeTimestamps(messages);

  const u = messages.filter(m => m.role === 'user').length;
  const a = messages.filter(m => m.role === 'assistant').length;
  console.log(`[Brain Shadow] Scraped: ${u}U / ${a}A`);

  const urlMatch = window.location.href.match(/\/c\/([\w-]+)/);
  const externalId = urlMatch ? urlMatch[1] : window.location.href;
  const title = document.querySelector('title')?.innerText?.trim() || 'Untitled';

  console.log('[Brain Shadow] Chat Title:', title);
  console.log('[Brain Shadow] Chat ID:', externalId);
  console.log('[Brain Shadow] Message Count:', messages.length);
  console.log('[Brain Shadow] Platform: chatgpt');

  return {
    platform: 'chatgpt',
    external_id: externalId,
    url: window.location.href,
    title,
    message_count: messages.length,
    messages,
    captured_at: new Date().toISOString(),
  };
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Send to background ───────────────────────────────────────────────────────
function sendToBackground(conversation) {

  return new Promise((resolve) => {

    chrome.runtime.sendMessage(
      {
        type: 'SAVE_CONVERSATION',
        payload: conversation
      },

      (response) => {

        if (chrome.runtime.lastError) {

          console.warn(
            '[Brain Shadow] Send failed:',
            chrome.runtime.lastError.message
          );

          resolve({
            status: 'error'
          });

          return;
        }

        console.log('[Brain Shadow] Saved:', response);

        resolve(response);
      }
    );
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Capture pipeline ─────────────────────────────────────────────────────────
let isCapturing = false;

async function captureAndSend() {

  if (isCapturing) {
    return { status: 'busy' };
  }

  isCapturing = true;

  try {

    console.log('[Brain Shadow] Capture triggered:', window.location.href);

    await waitForStreamingToFinish();

    await scrollToLoadAllMessages();

    const conversation = scrapeConversation();

    if (!conversation) {
      console.log('[Brain Shadow] Nothing to capture');
      return { status: 'empty' };
    }

    // WAIT for background save
    const result = await new Promise((resolve) => {

      chrome.runtime.sendMessage(
        {
          type: 'SAVE_CONVERSATION',
          payload: conversation
        },
        (response) => {

          if (chrome.runtime.lastError) {
            resolve({
              status: 'error',
              error: chrome.runtime.lastError.message
            });
            return;
          }

          resolve(response || { status: 'unknown' });
        }
      );

    });

    return {
      ...result,
      title: conversation.title,
      url: conversation.url,
      message_count: conversation.messages.length
    };

  } finally {
    isCapturing = false;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── MutationObserver + SPA watcher ───────────────────────────────────────────
// Debounce bumped to 3000ms — gives streaming enough time to start
// so isStreaming() is reliably true when we check it.
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(captureAndSend, 3000);
});

function waitForChatAndObserve() {
  const root = document.querySelector('main') || document.body;
  observer.observe(root, { childList: true, subtree: true });
  console.log('[Brain Shadow] Observer attached');
  setTimeout(captureAndSend, 3500);
}

// SPA navigation watcher
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.log('[Brain Shadow] Navigation detected →', location.href);
    // On navigation, wait a bit for new page to hydrate, then capture
    setTimeout(captureAndSend, 4000);
  }
}).observe(document, { subtree: true, childList: true });
// ─────────────────────────────────────────────────────────────────────────────

// ─── Bulk Import: Get sidebar chat URLs (for popup navigation) ────────────────

// ─── Get sidebar chat URLs for bulk import ────────────────────────────────
function getSidebarChatUrls() {
  // Try multiple selectors for sidebar chat links
  const selectors = [
    // Main sidebar - newer UI
    'nav a[href*="/c/"]',
    // Sidebar list items
    'aside a[href*="/c/"]',
    // Old sidebar pattern
    'div[class*="sidebar"] a[href*="/c/"]',
    // Fallback: any link to a conversation
    'a[href*="/c/"]',
  ];

  let links = [];
  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      links = Array.from(found);
      break;
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const urls = [];

  for (const link of links) {
    const href = link.href || link.getAttribute('href');
    if (!href || !href.includes('/c/')) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    urls.push(href);
  }

  console.log(`[Brain Shadow] Found ${urls.length} sidebar chat URLs`);
  return urls;
}

// ─── Message listener for bulk import ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SIDEBAR_CHATS') {
    const urls = getSidebarChatUrls();
    sendResponse(urls);
    return true;
  }
  if (message.type === 'CAPTURE_CURRENT') {

    captureAndSend()
      .then(sendResponse)
      .catch((err) => {
        sendResponse({
          status: 'error',
          error: err?.message || String(err)
        });
      });

    return true;
  }
  // PING for page readiness check during bulk import
  if (message.type === 'PING') {
    sendResponse({ pong: true, messageCount: document.querySelectorAll(MSG_SEL).length });
    return true;
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForChatAndObserve);
} else {
  waitForChatAndObserve();
}
