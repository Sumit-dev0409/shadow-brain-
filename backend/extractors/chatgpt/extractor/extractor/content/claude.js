// ============================================================
// Brain Shadow — Claude.ai Content Script v2
//
// FIXES IN THIS VERSION:
// ──────────────────────────────────────────────────────────
// FIX 1 — Streaming detection (premature capture)
//   Root cause: MutationObserver fired while Claude was still
//   generating a response. We now detect the streaming cursor
//   and "Stop" button and defer capture until they are gone.
//
// FIX 2 — Per-message relative timestamps
//   Root cause: All messages shared the same capture timestamp.
//   We assign ordered synthetic timestamps so messages remain
//   correctly sortable in any downstream system.
//
// FIX 3 — Consecutive same-role message deduplication
//   Root cause: Mid-stream scrapes caught partial/duplicate turns.
//   Consecutive same-role messages are merged (longer wins).
//
// FIX 4 — Conversation completeness validation
//   Root cause: Conversations with only user messages (no reply)
//   were saved. We now require the last message to be 'assistant'.
//
// FIX 5 — Robust message_count field
//   Root cause: claude.js never set message_count on the payload.
//   Background.js dedup logic depends on it — now always set.
// ──────────────────────────────────────────────────────────

const PLATFORM = 'claude';

// ─── Selectors ────────────────────────────────────────────
const USER_SEL      = '[data-testid="user-message"]';
const ASSISTANT_SEL = '[data-testid="assistant-message"]';
const ALL_MSG_SEL   = `${USER_SEL}, ${ASSISTANT_SEL}`;

// FIX 1: Elements present only while Claude is streaming
const STREAMING_INDICATORS = [
  'button[aria-label="Stop Response"]',
  'button[aria-label="Stop"]',
  '[data-testid="stop-button"]',
  '.streaming-indicator',
  '[class*="streaming"]',
  // Claude's animated cursor during generation
  '.result-streaming',
];
// ──────────────────────────────────────────────────────────

// ─── FIX 1: Streaming guard ────────────────────────────────
function isStreaming() {
  return STREAMING_INDICATORS.some(sel => document.querySelector(sel) !== null);
}

function waitForStreamingToFinish() {
  return new Promise((resolve) => {
    if (!isStreaming()) { resolve(); return; }

    console.log('[Brain Shadow] Claude is streaming — waiting…');
    const hardTimeout = setTimeout(resolve, 90_000);

    const poll = setInterval(() => {
      if (!isStreaming()) {
        clearInterval(poll);
        clearTimeout(hardTimeout);
        console.log('[Brain Shadow] Streaming done.');
        setTimeout(resolve, 800); // DOM settle grace period
      }
    }, 500);
  });
}
// ──────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getConversationId() {
  // Matches /chat/<uuid> in Claude's URL
  const match = window.location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

// ─── FIX 3: Merge consecutive same-role messages ──────────
function deduplicateConsecutiveRoles(messages) {
  if (!messages.length) return messages;

  const deduped = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = messages[i];
    if (curr.role === prev.role) {
      // Keep the longer (more complete) content
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
// ──────────────────────────────────────────────────────────

// ─── FIX 2: Relative timestamps ───────────────────────────
/**
 * Claude DOM doesn't expose real per-message timestamps.
 * We assign synthetic timestamps 1 second apart so downstream
 * systems can always sort messages correctly by time.
 */
function assignRelativeTimestamps(messages) {
  const now     = Date.now();
  const total   = messages.length;
  const STEP_MS = 1000;

  return messages.map((msg, i) => ({
    ...msg,
    index:     i,
    timestamp: new Date(now - (total - 1 - i) * STEP_MS).toISOString(),
  }));
}
// ──────────────────────────────────────────────────────────

// ─── Core extractor ────────────────────────────────────────
function extractConversation() {
  const userEls      = document.querySelectorAll(USER_SEL);
  const assistantEls = document.querySelectorAll(ASSISTANT_SEL);

  let rawMessages = [];

  if (userEls.length === 0 && assistantEls.length === 0) {
    // Fallback: class-name heuristic for layout changes
    const allTurns = document.querySelectorAll(
      '[class*="human"], [class*="assistant"], [class*="user-turn"], [class*="ai-turn"]'
    );
    allTurns.forEach(el => {
      const isUser = el.className.includes('human') || el.className.includes('user');
      const content = el.innerText?.trim();
      if (content) {
        rawMessages.push({ role: isUser ? 'user' : 'assistant', content });
      }
    });
  } else {
    // Primary path: sort user + assistant nodes by DOM order
    const allMessages = [];
    userEls.forEach(el => allMessages.push({ el, role: 'user' }));
    assistantEls.forEach(el => allMessages.push({ el, role: 'assistant' }));

    allMessages.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    allMessages.forEach(({ el, role }) => {
      const content = el.innerText?.trim();
      if (content) rawMessages.push({ role, content });
    });
  }

  if (!rawMessages.length) return null;

  // FIX 3: Remove consecutive same-role duplicates
  rawMessages = deduplicateConsecutiveRoles(rawMessages);

  // FIX 4: Don't save until assistant has replied
  const lastMsg = rawMessages[rawMessages.length - 1];
  if (!lastMsg || lastMsg.role !== 'assistant') {
    console.log('[Brain Shadow] Last message is not assistant — skipping (incomplete turn)');
    return null;
  }

  // FIX 2: Assign ordered timestamps
  const messages = assignRelativeTimestamps(rawMessages);

  const title          = document.title?.replace(' - Claude', '').trim() || 'Untitled';
  const conversationId = getConversationId();

  return {
    platform:      PLATFORM,
    external_id:   conversationId || `claude_${Date.now()}`,
    title,
    message_count: messages.length,   // FIX 5: always set
    messages,
    url:           window.location.href,
    captured_at:   new Date().toISOString(),
  };
}
// ──────────────────────────────────────────────────────────

// ─── Send to background ────────────────────────────────────
function sendToBrainShadow(data) {
  if (!data || !data.messages.length) return;
  chrome.runtime.sendMessage(
    { type: 'SAVE_CONVERSATION', payload: data },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Brain Shadow] Send failed:', chrome.runtime.lastError.message);
        return;
      }
      console.log(`[Brain Shadow] Saved: ${response?.status} — ${response?.reason || response?.key || ''}`);
    }
  );
}
// ──────────────────────────────────────────────────────────

// ─── Capture pipeline ──────────────────────────────────────
let isCapturing = false;

async function captureAndSend() {
  if (isCapturing) return;
  isCapturing = true;
  try {
    console.log('[Brain Shadow] Capture triggered');

    // FIX 1: Wait for Claude to finish streaming
    await waitForStreamingToFinish();

    const data = extractConversation();
    if (data) sendToBrainShadow(data);
    else console.log('[Brain Shadow] Nothing to capture or conversation incomplete');
  } finally {
    isCapturing = false;
  }
}
// ──────────────────────────────────────────────────────────

// ─── MutationObserver — count-change based ─────────────────
// Only triggers when the NUMBER of message nodes changes,
// not on every DOM mutation (much less noise).
let debounceTimer = null;
let lastCount     = 0;

const observer = new MutationObserver(() => {
  const count = document.querySelectorAll(ALL_MSG_SEL).length;
  if (count !== lastCount) {
    lastCount = count;
    clearTimeout(debounceTimer);
    // 3000ms debounce — ensures streaming has had time to START
    // so isStreaming() is reliably true when captureAndSend checks it
    debounceTimer = setTimeout(captureAndSend, 3000);
  }
});

observer.observe(document.body, { childList: true, subtree: true });
// ──────────────────────────────────────────────────────────

// ─── SPA navigation watcher ────────────────────────────────
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.log('[Brain Shadow] Navigation detected →', location.href);
    lastCount = 0; // reset count so new conversation is captured
    setTimeout(captureAndSend, 4000);
  }
}).observe(document, { subtree: true, childList: true });
// ──────────────────────────────────────────────────────────

// ─── Boot ──────────────────────────────────────────────────
window.addEventListener('load', () => {
  setTimeout(captureAndSend, 2500);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_CURRENT') {
    captureAndSend().then(() => sendResponse({ status: 'captured' }));
    return true;
  }

  // PING for page readiness check during bulk import
  if (message.type === 'PING') {
    sendResponse({ pong: true, messageCount: document.querySelectorAll(ALL_MSG_SEL).length });
    return true;
  }
});

console.log('[Brain Shadow] Claude content script v2 loaded');
