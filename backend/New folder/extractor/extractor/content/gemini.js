// ============================================================
// Brain Shadow — Gemini Content Script (UNIFIED)
//
// Aligned with chatgpt.js for seamless integration into 
// the Brain Shadow ingestion pipeline.
// ============================================================

const PLATFORM = 'gemini';

// Matches /app/[id] where id is at least 4 alphanumeric chars
const CONV_URL_RE = /\/app\/([a-zA-Z0-9_\-]{4,})/;

// ── Streaming Indicators (Gemini Specific) ──────────────────
const STREAMING_INDICATORS = [
    'button[aria-label="Stop generating"]',
    'button[aria-label="Stop"]',
    'button:has(mat-icon[svgicon="stop"])',
    '.processing-icon',
    '[class*="loading-indicator"]'
];

function isStreaming() {
    return STREAMING_INDICATORS.some(sel => document.querySelector(sel) !== null);
}

function waitForStreamingToFinish() {
    return new Promise((resolve) => {
        if (!isStreaming()) { resolve(); return; }

        console.log('[Brain Shadow] Gemini is streaming — waiting...');
        const hardTimeout = setTimeout(resolve, 90_000);

        const poll = setInterval(() => {
            if (!isStreaming()) {
                clearInterval(poll);
                clearTimeout(hardTimeout);
                console.log('[Brain Shadow] Streaming done.');
                setTimeout(resolve, 800); // DOM settle grace
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
      <div style="font-size:12px;margin-bottom:6px">${data.current || 0} / ${data.total || 0} chats</div>
      <div style="width:260px;height:4px;background:rgba(255,255,255,.3);border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#4CAF50;border-radius:2px"></div>
      </div>
      <div style="font-size:11px;margin-top:6px;color:rgba(255,255,255,.8)">${pct}% — ${data.title || '…'}</div>
    `;
    } catch (e) {
        console.error('[Brain Shadow] Overlay error:', e);
    }
}

function removeOverlay() { overlayEl?.remove(); overlayEl = null; }

// ── Relative Timestamps (Synthesized for order) ──────────
function assignRelativeTimestamps(messages) {
    const now = Date.now();
    const total = messages.length;
    const STEP_MS = 1000;

    return messages.map((msg, i) => ({
        ...msg,
        index: i,
        timestamp: new Date(now - (total - 1 - i) * STEP_MS).toISOString(),
    }));
}

// ── Sidebar Extraction ────────────────────────────────────
function getSidebarChatUrls() {
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    const seen = new Set();
    const urls = [];

    for (const link of allLinks) {
        const href = link.href || '';

        // --- A. URL Validation in Extraction ---
        if (!CONV_URL_RE.test(href)) {
            // Skip non-conversation links without logging to avoid noise, 
            // unless they look like they might be mistakenly picked up.
            continue;
        }

        let canonical;
        try {
            const u = new URL(href);
            canonical = `${u.origin}${u.pathname}`;
        } catch {
            console.warn('[Brain Shadow] Failed to parse URL:', href);
            continue;
        }

        if (seen.has(canonical)) continue;
        seen.add(canonical);
        urls.push(canonical);
        console.log(`[Brain Shadow] Valid Gemini URL found: ${canonical}`);
    }

    console.log(`[Brain Shadow] Total valid Gemini URLs extracted: ${urls.length}`);
    return urls;
}

async function scrollSidebarToLoadAll() {
    await new Promise(r => setTimeout(r, 1000));
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
    const target = sidebar || document.documentElement;
    return new Promise((resolve) => {
        let lastHeight = target.scrollHeight;
        let count = 0;
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

// ── Core Scraper ──────────────────────────────────────────
function scrapeConversation() {
    const USER_SEL = ['user-query', '.user-query', '[data-message-author-role="user"]', '.user-request-text', '.query-text'];
    const ASST_SEL = ['model-response', '.model-response', '[data-message-author-role="model"]', '.response-content', '.model-response-text'];

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

    if (userEls.length === 0 && asstEls.length === 0) {
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
            const content = el.innerText?.trim();
            return content && content.length > 3 ? { role, content } : null;
        })
        .filter(Boolean);

    // Merge consecutive same-role blocks (longer wins)
    const deduped = [];
    for (const msg of messages) {
        const prev = deduped[deduped.length - 1];
        if (prev && prev.role === msg.role) {
            if (msg.content.length > prev.content.length) deduped[deduped.length - 1] = msg;
        } else {
            deduped.push(msg);
        }
    }

    if (deduped.length === 0) return null;

    // Last message must be from assistant
    const lastMsg = deduped[deduped.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') {
        console.log('[Brain Shadow] Gemini: Last message not from assistant, skipping...');
        return null;
    }

    // Assign relative timestamps
    const finalMessages = assignRelativeTimestamps(deduped);

    const urlMatch = window.location.href.match(/\/app\/([a-zA-Z0-9_\-]{4,})/);
    const externalId = urlMatch ? urlMatch[1] : window.location.href;
    const title = document.querySelector('title')?.innerText?.replace(' - Gemini', '').trim() || 'Untitled Gemini Chat';

    return {
        platform: PLATFORM,
        external_id: externalId,
        url: window.location.href,
        title,
        message_count: finalMessages.length,
        messages: finalMessages,
        captured_at: new Date().toISOString()
    };
}

// ── Send to Background ────────────────────────────────────
function sendToBackground(conversation) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: 'SAVE_CONVERSATION',
            payload: conversation
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Brain Shadow] Save failed:', chrome.runtime.lastError.message);
                resolve({ status: 'error' });
                return;
            }
            resolve(response);
        });
    });
}

// ── Capture Pipeline ──────────────────────────────────────
let isCapturing = false;

async function captureAndSend() {
    if (isCapturing) return { status: 'busy' };
    isCapturing = true;

    try {
        console.log('[Brain Shadow] Gemini capture triggered');
        await waitForStreamingToFinish();

        const conversation = scrapeConversation();
        if (!conversation) {
            console.log('[Brain Shadow] Gemini: Nothing to capture');
            return { status: 'empty' };
        }

        const result = await sendToBackground(conversation);
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

// ── MutationObserver + SPA Watcher (Auto-Resume) ──────────
let debounceTimer = null;
const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(captureAndSend, 3000);
});

function waitForGeminiAndObserve() {
    const root = document.querySelector('main') || document.body;
    if (root) {
        observer.observe(root, { childList: true, subtree: true });
        console.log('[Brain Shadow] Gemini observer attached');
    }
    // Initial capture after a short delay
    setTimeout(captureAndSend, 3500);
}

// SPA Navigation Detection
let lastUrl = location.href;
const navigationObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[Brain Shadow] Gemini navigation detected →', location.href);
        // Wait for hydration/rendering then capture
        setTimeout(captureAndSend, 4000);
    }
});
navigationObserver.observe(document, { subtree: true, childList: true });

// Tab Visibility Recovery
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log('[Brain Shadow] Gemini tab became visible — resuming capture');
        captureAndSend();
    }
});

// ── Message Listener (Unified) ─────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message.type || message.action; // Support both patterns for verification

    // Standard UI Actions
    if (type === 'scrapeProgress') { showOverlay(message); return; }
    if (type === 'scrapeDone') { removeOverlay(); return; }

    // Unified Pipeline Hooks
    if (type === 'GET_SIDEBAR_CHATS' || type === 'extractRecents') {
        scrollSidebarToLoadAll().then(() => {
            const urls = getSidebarChatUrls();
            if (type === 'extractRecents') {
                sendResponse({ threads: urls.map(u => ({ url: u, title: 'Gemini Chat' })) });
            } else {
                sendResponse(urls);
            }
        });
        return true;
    }

    if (type === 'CAPTURE_CURRENT' || type === 'extractCurrent' || type === 'extractConversation') {
        captureAndSend().then((result) => {
            if (type === 'extractConversation') {
                chrome.runtime.sendMessage({ action: 'conversationExtracted', data: result });
            }
            sendResponse(result);
        });
        return true;
    }

    if (type === 'PING') {
        sendResponse({
            pong: true,
            messageCount: document.querySelectorAll('user-query, model-response, .user-query, .model-response').length
        });
        return true;
    }
});

// ── Boot ──────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForGeminiAndObserve);
} else {
    waitForGeminiAndObserve();
}

console.log('[Brain Shadow] Gemini unified content script loaded');