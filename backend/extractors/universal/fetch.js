/**
 * Brain Shadow — Universal Content Script
 *
 * Detects the current platform from hostname and applies
 * the correct selectors, URL patterns, and ID extraction.
 * Supports: ChatGPT, Claude, Gemini, Blackbox, DeepSeek,
 *           MS Copilot, GitHub Copilot, Perplexity, Grok
 */

// ══════════════════════════════════════════════════════════
// Platform configurations
// ══════════════════════════════════════════════════════════
const PLATFORM_CONFIGS = {
  'chat.openai.com':   chatgptConfig(),
  'chatgpt.com':       chatgptConfig(),
  'claude.ai':         claudeConfig(),
  'gemini.google.com': geminiConfig(),
  'www.blackbox.ai':   blackboxConfig(),
  'blackbox.ai':       blackboxConfig(),
  'chat.deepseek.com': deepseekConfig(),
  'copilot.microsoft.com': mscopilotConfig(),
  'github.com':        githubCopilotConfig(),
  'www.perplexity.ai': perplexityConfig(),
  'perplexity.ai':     perplexityConfig(),
  'grok.com':          grokConfig(),
  'x.com':             grokConfig(),
};

function chatgptConfig() {
  return {
    platform:   'chatgpt',
    convUrlRe:  /\/c\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[data-message-author-role="user"]'],
    asstSel:    ['[data-message-author-role="assistant"]'],
    streaming:  ['button[data-testid="stop-button"]', 'button[aria-label="Stop generating"]', '.result-streaming'],
    extractId:  url => url.match(/\/c\/([\w\-]+)/)?.[1] || url,
    titleClean: t => t.replace(' - ChatGPT', '').replace(' | ChatGPT', ''),
  };
}

function claudeConfig() {
  return {
    platform:   'claude',
    convUrlRe:  /\/(?:chat|c|conversation)\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[data-testid*="human"]', '[data-testid*="user"]', '[class*="humanMessage"]', '[class*="font-user-message"]'],
    asstSel:    ['[data-testid*="assistant"]', '[class*="assistantMessage"]', '[class*="font-claude-message"]', '[class*="font-claude-response"]'],
    streaming:  ['button[aria-label="Stop generating"]', '[data-testid="stop-button"]'],
    extractId:  url => { const m = url.match(/\/(?:chat|c|conversation)\/([\w\-]+)/); return m?.[1] || url; },
    titleClean: t => t.replace(' - Claude', '').replace(' | Claude', ''),
  };
}

function geminiConfig() {
  return {
    platform:   'gemini',
    convUrlRe:  /\/app\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['user-query', '.user-query', '[data-message-author-role="user"]', '[class*="user-query"]'],
    asstSel:    ['model-response', '.model-response', '[data-message-author-role="model"]', '[class*="model-response"]'],
    streaming:  ['button[aria-label="Stop generating"]', 'button[aria-label="Stop response"]', 'mat-progress-bar'],
    extractId:  url => { const p = new URL(url).pathname.split('/').filter(Boolean); const i = p.findIndex(x=>x==='app'); return i !== -1 && p[i+1] ? p[i+1] : p[p.length-1]; },
    titleClean: t => t.replace(' - Gemini', '').replace(' | Gemini', ''),
  };
}

function blackboxConfig() {
  return {
    platform:   'blackbox',
    convUrlRe:  /\/chat\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[data-role="user"]', '[class*="userMessage"]', '[class*="user-message"]'],
    asstSel:    ['[data-role="assistant"]', '[class*="assistantMessage"]', '[class*="BlackboxResponse"]', '[class*="modelResponse"]'],
    streaming:  ['button[aria-label*="Stop" i]', '[class*="stopButton"]', '[class*="generating"]'],
    extractId:  url => { const p = new URL(url).pathname.split('/').filter(Boolean); const i = p.findIndex(x=>x==='chat'); return i !== -1 && p[i+1] ? p[i+1] : p[p.length-1]; },
    titleClean: t => t.replace(' - Blackbox AI', '').replace(' | Blackbox AI', ''),
  };
}

function deepseekConfig() {
  return {
    platform:   'deepseek',
    convUrlRe:  /\/chat\/s\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[class*="userMessage"]', '[class*="user-message"]', '[class*="humanMessage"]', '[class*="message_user"]', '[class*="_userContent"]'],
    asstSel:    ['.ds-markdown', '[class*="ds-markdown"]', '[class*="assistantMessage"]', '[class*="markdownContent"]', '[class*="message_assistant"]'],
    streaming:  ['[class*="stopButton"]', 'button[aria-label*="Stop" i]', '[class*="generating"]'],
    extractId:  url => { try { const p = new URL(url).pathname.split('/').filter(Boolean); const i = p.findLastIndex(x=>x==='chat'); if(i!==-1){const after=p.slice(i+1);const u=after.find(s=>s.length>=8&&s!=='s');if(u)return u;} return p[p.length-1]; } catch { return url; } },
    titleClean: t => t.replace(' - DeepSeek', '').replace(' | DeepSeek', ''),
  };
}

function mscopilotConfig() {
  return {
    platform:   'copilot',
    convUrlRe:  /\/(?:c|chats|chat|thread|threads|conversation|conversations)\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[data-testid*="user-message"]', '[class*="userMessage"]', '[aria-label*="You said" i]'],
    asstSel:    ['[data-testid*="copilot-message"]', '[class*="copilotMessage"]', '[class*="BotBubble"]'],
    streaming:  ['button[aria-label="Stop responding"]', '[class*="stopButton"]', '.typing-indicator'],
    extractId:  url => { try { const m = new URL(url).pathname.match(/\/(?:c|chats|chat|thread)\/([\w\-]+)/); return m?.[1] || new URL(url).searchParams.get('conversationId') || url; } catch { return url; } },
    titleClean: t => t.replace(' - Microsoft Copilot', '').replace(' | Copilot', ''),
  };
}

function githubCopilotConfig() {
  return {
    platform:   'copilot',
    convUrlRe:  /\/copilot\/(?:c|conversations)\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[data-testid*="user-message"]', '[class*="UserMessage"]', '[class*="promptText"]'],
    asstSel:    ['[data-testid*="assistant-message"]', '[class*="CopilotMessage"]', '.markdown-body'],
    streaming:  ['button[data-testid="stop-button"]', 'button[aria-label="Stop generating"]'],
    extractId:  url => { const m = url.match(/\/copilot\/(?:c|conversations)\/([\w\-]+)/); return m?.[1] || url; },
    titleClean: t => t.replace(' - GitHub Copilot', '').replace(' | GitHub Copilot', ''),
  };
}

function perplexityConfig() {
  return {
    platform:  'perplexity',
    convUrlRe: /\/(?:search|page|c)\/([a-zA-Z0-9_\-]{4,})/,
    userSel:   [],
    asstSel:   [],
    streaming: ['button[aria-label*="Stop" i]', '[class*="skeleton"]', '[class*="animate-pulse"]'],
    extractId: url => {
      try { const m = new URL(url).pathname.match(/\/(?:search|page|c)\/([\w\-]+)/); return m?.[1] || url; }
      catch { return url; }
    },
    titleClean: t => t.replace(/ [-|] Perplexity.*$/, '').trim(),

    // Custom extractor — Perplexity is a search engine, not a chat.
    extractCustom() {
      // ── User query ──────────────────────────────────────────
      // Prefer the question as actually displayed on the page — Perplexity
      // renders it as a heading above the answer. This is far more reliable
      // than guessing from the URL slug, which is sometimes just the raw
      // conversation id with no descriptive words in it at all (e.g. a
      // shared link, or a slug Perplexity didn't bother generating) — that
      // previously saved literal ids like "316a8535 e661 40b1 b51b" as the
      // "question" instead of what was actually asked.
      const headingSel = [
        'h1', '[class*="Query" i] h1', '[class*="query" i] h1',
        '[data-testid*="query" i]', '[class*="QueryText" i]', '[class*="query-text" i]',
      ];
      let domQuery = '';
      for (const sel of headingSel) {
        let el; try { el = document.querySelector(sel); } catch { continue; }
        const t = el?.innerText?.trim();
        if (t && t.length > 2 && t.length < 500) { domQuery = t; break; }
      }

      const slug = location.pathname.split('/').filter(Boolean).pop() || '';
      const slugQuery = slug.replace(/-[A-Za-z0-9]{6,}$/, '').replace(/-/g, ' ').trim();
      // A slug that's really just the bare id (stripping the trailing id
      // suffix removed nothing, so swapping dashes for spaces just turns the
      // id itself into space-separated hex chunks) is not a real question.
      const looksLikeBareId = slugQuery && (!slugQuery.includes(' ') || /^[0-9a-f\s]+$/i.test(slugQuery));

      const query = domQuery
        || (slugQuery && !looksLikeBareId ? slugQuery : '')
        || document.title.replace(/ [-|] Perplexity.*$/i, '').trim()
        || 'Search query';

      // ── Answer: try specific selectors, then grab biggest
      //    text block on the whole page — guaranteed to work ──
      const SKIP = new Set(['SCRIPT','STYLE','NAV','HEADER','FOOTER','ASIDE']);

      // Try specific selectors first
      const specific = ['.prose','[class*="prose"]','[class*="AnswerBody"]',
        '[class*="answer"]','[class*="markdown"]','[class*="content"]','article','main section'];
      let answerText = '';
      for (const sel of specific) {
        const best = [...document.querySelectorAll(sel)]
          .filter(el => {
            let p = el; while (p) { if (SKIP.has(p.tagName)) return false; p = p.parentElement; }
            return true;
          })
          .map(el => el.innerText?.trim() || '')
          .filter(t => t.length > 80)
          .sort((a, b) => b.length - a.length)[0];
        if (best) { answerText = best; break; }
      }

      // Fallback: biggest div/section anywhere on page
      if (!answerText) {
        const all = [...document.querySelectorAll('div,section,article,p')]
          .filter(el => {
            let p = el; while (p) { if (SKIP.has(p.tagName)) return false; p = p.parentElement; }
            const t = el.innerText?.trim() || '';
            return t.length > 100 && el.children.length < 30;
          });
        all.sort((a, b) => (b.innerText?.length || 0) - (a.innerText?.length || 0));
        answerText = all[0]?.innerText?.trim() || '';
      }

      if (!answerText) return null;
      return { userMsg: query, asstMsg: answerText.slice(0, 5000) };
    },
  };
}

function grokConfig() {
  return {
    platform:   'grok',
    convUrlRe:  /\/(?:chat|c|conversation|conversations)\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[data-testid*="user-message"]', '[class*="UserMessage"]', '[class*="userBubble"]'],
    asstSel:    ['[data-testid*="grok-message"]', '[class*="GrokMessage"]', '[class*="AssistantMessage"]'],
    streaming:  ['button[aria-label="Stop generating"]', '[class*="StopButton"]', '[class*="thinking"]'],
    extractId:  url => { const m = url.match(/\/(?:chat|c|conversation)\/([\w\-]+)/); return m?.[1] || url; },
    titleClean: t => t.replace(' | Grok', '').replace(' - Grok', ''),
  };
}

// Known non-conversation path segments that can still structurally match a
// platform's convUrlRe (e.g. Gemini's own promo link "/app/download" matches
// "/app/<4+ chars>" exactly as well as a real "/app/<chat-id>" does) — used
// wherever a URL's captured id needs to be checked for being an actual chat.
const NON_CONVERSATION_IDS = /^(login|signup|settings|help|about|privacy|terms|logout|new|upgrade|billing|home|discover|download|library|app|search|explore|account|profile)$/i;

// ── Detect current platform ────────────────────────────────
const host   = location.hostname;
const config = PLATFORM_CONFIGS[host] || Object.entries(PLATFORM_CONFIGS).find(([h]) => host.includes(h))?.[1];

if (!config) {
  console.log('[Brain Shadow] Unsupported platform:', host);
} else {
  console.log(`[Brain Shadow] Platform detected: ${config.platform} on ${host}`);
  init();
}

// ══════════════════════════════════════════════════════════
// Core logic (runs only on supported platforms)
// ══════════════════════════════════════════════════════════
function init() {

  // ── Streaming guard ──────────────────────────────────────
  function isStreaming() {
    return (config.streaming || []).some(sel => document.querySelector(sel) !== null);
  }

  function waitForStreamingToFinish() {
    return new Promise((resolve) => {
      if (!isStreaming()) { resolve(); return; }
      const hard = setTimeout(resolve, 90_000);
      const poll = setInterval(() => {
        if (!isStreaming()) { clearInterval(poll); clearTimeout(hard); setTimeout(resolve, 800); }
      }, 500);
    });
  }

  // ── Scroll conversation to load all messages ─────────────
  function getConversationContainer() {
    const allSels = [...(config.userSel || []), ...(config.asstSel || [])];
    const anchor  = allSels.reduce((found, sel) => found || document.querySelector(sel), null);
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
      const finish = () => {
        // Virtualized message lists (ChatGPT, and likely others) unmount the
        // earliest messages once we've scrolled well past them. If we scrape
        // right after landing at the bottom, the first user message is often
        // gone from the DOM — that's what produces captures that start with
        // "assistant" instead of "user". Scroll back to the top and give the
        // list a moment to re-render there before scraping.
        c.scrollTop = 0;
        setTimeout(resolve, 700);
      };
      const tick = () => { pos += step; c.scrollTop = pos; setTimeout(() => { pos < c.scrollHeight ? tick() : finish(); }, 500); };
      setTimeout(tick, 400);
      setTimeout(finish, 30_000);
    });
  }

  // ── Platform custom extractor (e.g. Perplexity) ─────────
  function scrapeCustom() {
    if (!config.extractCustom) return null;
    const result = config.extractCustom();
    if (!result) return null;
    const { userMsg, asstMsg } = result;
    const messages = assignRelativeTimestamps([
      { role: 'user',      content: userMsg },
      { role: 'assistant', content: asstMsg },
    ]);
    const external_id = config.extractId ? config.extractId(location.href) : location.href;
    const rawTitle    = document.title || '';
    const title       = (config.titleClean ? config.titleClean(rawTitle) : rawTitle).trim() || external_id;
    return { platform: config.platform, external_id, url: location.href, title, message_count: messages.length, messages, captured_at: new Date().toISOString() };
  }

  // ── Message extraction ───────────────────────────────────
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

  // Union every configured selector's matches instead of only using whichever
// selector happens to match first. Real chat UIs often render messages with
// slightly different DOM structure depending on content (attachments, code
// blocks, edited turns, etc.), so a single "first match wins" selector
// silently drops any message that doesn't fit that one pattern. This also
// makes the count consistent with PING's readiness check below, which
// already unions all selectors via a single comma-joined query.
function queryAllSelectors(selectors) {
  const seen = new Set();
  const out  = [];
  for (const sel of (selectors || [])) {
    let found;
    try { found = document.querySelectorAll(sel); } catch { continue; }
    for (const el of found) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
  }
  // Guard against two configured selectors matching a message's outer
  // container AND an inner content wrapper inside it (e.g. a message bubble
  // plus a nested markdown div) — that would otherwise double-count the same
  // message as two overlapping entries. Keep only outermost matches.
  return out.filter(el => !out.some(other => other !== el && other.contains(el)));
}

// Per-selector match counts, so we can see exactly which configured
// selector (if any) is finding messages on a given platform right now,
// without needing to inspect the live DOM by hand.
function debugSelectorBreakdown(label, selectors) {
  const breakdown = (selectors || []).map(sel => {
    let count = 0;
    try { count = document.querySelectorAll(sel).length; } catch { count = -1; /* invalid selector */ }
    return `${sel} → ${count}`;
  });
  console.log(`[Brain Shadow][debug] ${config.platform} ${label} selectors:\n  ` + breakdown.join('\n  '));
}

function scrapeConversation() {
    debugSelectorBreakdown('userSel', config.userSel);
    debugSelectorBreakdown('asstSel', config.asstSel);

    let userEls = queryAllSelectors(config.userSel);
    let asstEls = queryAllSelectors(config.asstSel);

    console.log(`[Brain Shadow][debug] ${config.platform} matched: ${userEls.length} user, ${asstEls.length} assistant (after union + ancestor-filter)`);

    // Container fallback — last resort when none of the configured selectors
    // matched anything. This heuristic just alternates a container's direct
    // children as user/assistant, which breaks if there's any non-message
    // child mixed in (date separators, buttons, etc.) — logged loudly since
    // it's the most likely source of scrambled/wrong role assignment.
    if (!userEls.length && !asstEls.length) {
      console.warn(`[Brain Shadow][debug] ${config.platform}: no configured selector matched ANYTHING — falling back to fragile container heuristic. This platform's selectors likely need updating.`);
      const candidates = [
        '[class*="chatContent"]', '[class*="messageList"]', '[class*="MessageList"]',
        '[class*="conversation"]', '[class*="Conversation"]', '[class*="chat-list"]',
        '[class*="ChatList"]', '[role="log"]', 'main',
      ];
      for (const sel of candidates) {
        let c;
        try { c = document.querySelector(sel); } catch { continue; }
        if (!c) continue;
        // Many modern layouts wrap the actual message list in one or more
        // single-child "container" divs (e.g. <main><div class="layout">
        // <div class="scroller">...actual messages...</div></div></main>),
        // so looking only at the immediate children of a coarse container
        // selector like "main" usually finds just 1 wrapper, not the real
        // messages. Drill down through single-child chains until we reach a
        // level that actually branches into multiple text-bearing children.
        let node = c;
        for (let depth = 0; depth < 6; depth++) {
          const children = [...node.children].filter(el => (el.innerText?.trim().length || 0) > 3);
          if (children.length >= 2) {
            console.warn(`[Brain Shadow][debug] ${config.platform}: container fallback matched "${sel}" (drilled ${depth} level(s) deep) with ${children.length} children — alternating even/odd as user/assistant (fragile).`);
            children.forEach((el, i) => (i % 2 === 0 ? userEls : asstEls).push(el));
            break;
          }
          if (node.children.length === 1) { node = node.children[0]; continue; }
          break;
        }
        if (userEls.length || asstEls.length) break;
      }
    }

    if (!userEls.length && !asstEls.length) {
      console.warn(`[Brain Shadow][debug] ${config.platform}: scrapeConversation() found NOTHING — returning null (this will show as "empty" in the popup).`);
      return null;
    }

    const allItems = [
      ...userEls.map(el => ({ el, role: 'user' })),
      ...asstEls.map(el => ({ el, role: 'assistant' })),
    ].sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

    let messages = allItems
      .map(({ el, role }) => { const content = el.innerText?.trim(); return content && content.length > 3 ? { role, content } : null; })
      .filter(Boolean);

    messages = deduplicateConsecutiveRoles(messages);
    const first = messages[0];
    const last  = messages[messages.length - 1];
    // A conversation must start with the user's message. If it doesn't, the
    // capture is incomplete (usually because a virtualized message list had
    // already unmounted the earliest turns) — save nothing rather than store
    // a permanently-corrupt conversation that's missing its own opening.
    if (!first || first.role !== 'user') {
      console.warn(`[Brain Shadow][debug] ${config.platform}: first message role is "${first?.role || 'none'}", not "user" — discarding capture (likely missed via scroll/virtualization).`);
      console.log(`[Brain Shadow][debug] ${config.platform} message roles in order: ` + messages.map(m => m.role).join(', '));
      return null;
    }
    if (!last || last.role !== 'assistant') {
      console.warn(`[Brain Shadow][debug] ${config.platform}: last message role is "${last?.role || 'none'}", not "assistant" — discarding capture. If role assignment looks backwards below, the fragile container fallback likely mixed up user/assistant order.`);
      console.log(`[Brain Shadow][debug] ${config.platform} message roles in order: ` + messages.map(m => m.role).join(', '));
      return null;
    }
    messages = assignRelativeTimestamps(messages);

    const external_id = config.extractId ? config.extractId(location.href) : location.href;
    const rawTitle    = document.title || '';
    const title       = (config.titleClean ? config.titleClean(rawTitle) : rawTitle).trim() || external_id;

    console.log(`[Brain Shadow][debug] ${config.platform} captured ${messages.length} messages. Preview:\n` +
      messages.map(m => `  [${m.role}] ${m.content.slice(0, 80).replace(/\n/g, ' ')}${m.content.length > 80 ? '…' : ''}`).join('\n'));

    return { platform: config.platform, external_id, url: location.href, title, message_count: messages.length, messages, captured_at: new Date().toISOString() };
  }

  // ── Capture pipeline ─────────────────────────────────────
  let isCapturing = false;

  // scroll=true only when user clicks "Capture Current" — never during auto-capture
  async function captureAndSend(scroll = false) {
    if (isCapturing) return { status: 'busy' };
    isCapturing = true;
    try {
      // Only capture on an actual conversation-shaped URL. Without this, the
      // always-on observer fires on ANY page load (a landing page, the bare
      // app root, a "download the app" link, a library/search-home view) and
      // happily "captures" it — extractId falls back to whatever's left in
      // the path (e.g. "app", "download") or the raw URL, saving a garbage
      // conversation that pollutes storage and can never be cleaned up by
      // re-scraping. Real per-conversation URLs always match convUrlRe, and
      // their captured id is never one of the known non-conversation words
      // (some promo/nav links coincidentally match the same URL shape).
      if (config.convUrlRe) {
        const m = config.convUrlRe.exec(location.href);
        if (!m || NON_CONVERSATION_IDS.test(m[1])) return { status: 'empty' };
      }
      await waitForStreamingToFinish();
      if (scroll) await scrollToLoadAllMessages();
      const conversation = scrapeCustom() || scrapeConversation();
      if (!conversation) return { status: 'empty' };
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'SAVE_CONVERSATION', payload: conversation },
          (r) => resolve(chrome.runtime.lastError ? { status: 'error', error: chrome.runtime.lastError.message } : (r || { status: 'unknown' })));
      });
      console.log(`[Brain Shadow] Captured: ${conversation.title} — ${result.status}${result.synced ? ' (synced to backend)' : ''}`);
      return { ...result, title: conversation.title, message_count: conversation.messages.length };
    } finally { isCapturing = false; }
  }

  // ── MutationObserver ─────────────────────────────────────
  let debounceTimer = null;
  const observer = new MutationObserver(() => { clearTimeout(debounceTimer); debounceTimer = setTimeout(captureAndSend, 3000); });

  function waitForChatAndObserve() {
    observer.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
    console.log(`[Brain Shadow] Observer attached (${config.platform})`);
    setTimeout(captureAndSend, 3500);
  }

  // ── SPA navigation watcher ───────────────────────────────
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(captureAndSend, 4000); }
  }).observe(document, { subtree: true, childList: true });

  // ── Sidebar: get conversation list ───────────────────────
  function extractRecents() {
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    console.log(`[Brain Shadow] ${config.platform} <a> tags: ${allLinks.length}`);
    console.log('[Brain Shadow] ALL hrefs:\n' + [...new Set(allLinks.map(a => a.getAttribute('href')))].slice(0, 50).join('\n'));

    const seen = new Set(), threads = [];

    // Pass 1 — platform-specific regex
    for (const link of allLinks) {
      const href = link.href || '';
      if (config.convUrlRe && !config.convUrlRe.test(href)) continue;
      const capturedId = config.convUrlRe?.exec(href)?.[1];
      if (capturedId && NON_CONVERSATION_IDS.test(capturedId)) continue;
      let canonical; try { const u = new URL(href); canonical = `${u.origin}${u.pathname}`; } catch { continue; }
      if (seen.has(canonical)) continue; seen.add(canonical);
      const title = link.getAttribute('aria-label')?.trim() || link.getAttribute('title')?.trim() ||
        link.querySelector('span,p,div,h1,h2,h3')?.innerText?.trim() || link.innerText?.trim() ||
        `Chat ${threads.length + 1}`;
      threads.push({ url: canonical, title: title.slice(0, 120) });
    }

    // Pass 2 — broad UUID fallback. Previously this only ran when Pass 1
    // found literally nothing, but a platform whose sidebar links don't all
    // match convUrlRe (or whose regex is slightly off) would silently miss
    // conversations Pass 1 didn't catch, without ever trying the broader
    // heuristic. Always run it and merge in anything new.
    {
      const before = threads.length;
      const SKIP = new RegExp(`\\/${NON_CONVERSATION_IDS.source.slice(1, -1)}\\b`, 'i');
      for (const link of allLinks) {
        let u; try { u = new URL(link.href); } catch { continue; }
        if (u.origin !== location.origin) continue;
        if (SKIP.test(u.pathname) || u.pathname.length < 4) continue;
        if (!u.pathname.split('/').filter(Boolean).some(s => /^[a-zA-Z0-9_\-]{8,}$/.test(s))) continue;
        const canonical = `${u.origin}${u.pathname}`;
        if (seen.has(canonical)) continue; seen.add(canonical);
        const title = link.getAttribute('aria-label')?.trim() || link.innerText?.trim() || `Chat ${threads.length + 1}`;
        threads.push({ url: canonical, title: title.slice(0, 120) });
      }
      if (threads.length > before) console.log(`[Brain Shadow] Broad scan added ${threads.length - before} more (${before} from regex pass)`);
    }

    // DeepSeek: also try localStorage
    if (threads.length === 0 && host === 'chat.deepseek.com') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          let raw; try { raw = JSON.parse(localStorage.getItem(key)); } catch { continue; }
          const data = raw?.state ?? raw;
          const candidates = typeof data === 'object' && data !== null ? Object.values(data) : [data];
          for (const val of candidates) {
            if (!Array.isArray(val)) continue;
            for (const item of val) {
              if (typeof item !== 'object' || !item) continue;
              const id    = item.id || item.sessionId || item.chatId;
              const title = item.title || item.name || `DeepSeek chat`;
              if (!id || !/^[a-zA-Z0-9_\-]{8,}$/.test(id)) continue;
              if (!seen.has(id)) { seen.add(id); threads.push({ url: `${location.origin}/chat/s/${id}`, title: String(title).slice(0, 120) }); }
            }
          }
        }
        if (threads.length > 0) console.log(`[Brain Shadow] DeepSeek localStorage: ${threads.length}`);
      } catch {}
    }

    console.log(`[Brain Shadow] ${config.platform} conversations: ${threads.length}`);
    return threads;
  }

  async function scrollSidebarToLoadAll() {
    await new Promise(r => setTimeout(r, 1500));
    let sidebar = null;
    const firstLink = [...document.querySelectorAll('a[href]')].find(a => config.convUrlRe?.test(a.href));
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

  // ── Message listener ─────────────────────────────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_SIDEBAR_CHATS') {
      scrollSidebarToLoadAll().then(() => sendResponse(extractRecents()));
      return true;
    }
    if (request.type === 'CAPTURE_CURRENT') {
      captureAndSend(true).then(sendResponse).catch(err => sendResponse({ status: 'error', error: err?.message }));
      return true;
    }
    if (request.type === 'PING') {
      const allSels  = [...(config.userSel || []), ...(config.asstSel || [])];
      const combined = allSels.join(',');
      const count    = combined ? document.querySelectorAll(combined).length : 0;
      sendResponse({ pong: true, messageCount: count, platform: config.platform });
      return true;
    }
  });

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForChatAndObserve);
  } else {
    waitForChatAndObserve();
  }

} // end init()
