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

  // ══════════════════════════════════════════════════════════
  // PHASE 1 — DISCOVER ALL CHATS
  //
  // The sidebar is virtualized on every supported platform: only a window
  // of ~20-30 conversation rows exists in the DOM at any instant. The old
  // approach (scroll to bottom ONCE, then read the DOM once) could only
  // ever see that final window — hence "29-30 chats" regardless of account
  // size. The flow below instead walks the whole list incrementally,
  // merging every rendered row into a persistent Map keyed by a stable
  // identifier, and only finishes when real end-of-list signals fire.
  // ══════════════════════════════════════════════════════════

  function linkTitle(link, fallbackIndex) {
    return (
      link.getAttribute('aria-label')?.trim() ||
      link.getAttribute('title')?.trim() ||
      link.querySelector('span,p,div,h1,h2,h3')?.innerText?.trim() ||
      link.innerText?.trim() ||
      `Chat ${fallbackIndex}`
    ).slice(0, 120);
  }

  // Stable identifier priority: conversation id → canonical URL. The key is
  // what dedupes rows across hundreds of scroll cycles, so the same chat
  // re-rendered many times is counted exactly once.
  function stableKeyFor(href) {
    try {
      if (config.extractId) {
        const id = config.extractId(href);
        if (id && id !== href) return `${config.platform}:${id}`;
      }
      const u = new URL(href);
      return `${u.origin}${u.pathname}`;
    } catch {
      return href;
    }
  }

  // DeepSeek keeps its session list in localStorage rather than (only) in
  // sidebar anchors — scan it once per discovery run and merge the result
  // into every harvest cycle.
  let deepseekLocalCache = null;
  function deepseekLocalChats(force = false) {
    if (!force && deepseekLocalCache) return deepseekLocalCache;
    const out = [];
    if (host !== 'chat.deepseek.com') { deepseekLocalCache = out; return out; }
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
            const title = item.title || item.name || 'DeepSeek chat';
            if (!id || !/^[a-zA-Z0-9_\-]{8,}$/.test(id)) continue;
            out.push({ key: `deepseek:${id}`, id: String(id), url: `${location.origin}/chat/s/${id}`, title: String(title).slice(0, 120), platform: 'deepseek' });
          }
        }
      }
      if (out.length) console.log(`[Brain Shadow][DISCOVERY] DeepSeek localStorage: ${out.length} sessions`);
    } catch {}
    deepseekLocalCache = out;
    return out;
  }

  // Collect EVERY conversation currently rendered in the sidebar DOM.
  // Pure read — no scrolling, no side effects. Called once per engine cycle;
  // dedup happens in the engine's persistent Map, not here.
  function collectVisibleChats() {
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    const threads = [];
    const seenUrls = new Set();
    let n = 0;

    const push = (key, id, url, title) => {
      n++;
      if (seenUrls.has(key)) return;
      seenUrls.add(key);
      threads.push({ key, ...(id ? { id } : {}), url, title, platform: config.platform });
    };

    // Pass 1 — platform-specific regex (highest-confidence matches)
    for (const link of allLinks) {
      const href = link.href || '';
      if (config.convUrlRe && !config.convUrlRe.test(href)) continue;
      const capturedId = config.convUrlRe?.exec(href)?.[1];
      if (capturedId && NON_CONVERSATION_IDS.test(capturedId)) continue;
      let canonical; try { const u = new URL(href); canonical = `${u.origin}${u.pathname}`; } catch { continue; }
      push(stableKeyFor(canonical), capturedId, canonical, linkTitle(link, threads.length + 1));
    }

    // Pass 2 — broad UUID fallback merged in (platforms whose sidebar links
    // don't all match convUrlRe).
    {
      const SKIP = new RegExp(`\\/${NON_CONVERSATION_IDS.source.slice(1, -1)}\\b`, 'i');
      for (const link of allLinks) {
        let u; try { u = new URL(link.href); } catch { continue; }
        if (u.origin !== location.origin) continue;
        if (SKIP.test(u.pathname) || u.pathname.length < 4) continue;
        if (!u.pathname.split('/').filter(Boolean).some(s => /^[a-zA-Z0-9_\-]{8,}$/.test(s))) continue;
        const canonical = `${u.origin}${u.pathname}`;
        push(`${canonical}`, null, canonical, linkTitle(link, threads.length + 1));
      }
    }

    // DeepSeek localStorage sessions merge into every cycle.
    for (const c of deepseekLocalChats()) push(c.key, c.id, c.url, c.title);

    return threads;
  }

  function isScrollableEl(el) {
    const s = window.getComputedStyle(el);
    return s.overflowY === 'auto' || s.overflowY === 'scroll';
  }

  // Rank ALL plausible sidebar scrollers by how many conversation anchors
  // each contains — resilient to markup redesigns on any platform. The
  // engine drives the top-ranked candidate and rotates down this list
  // whenever one proves inert, so a single mis-scored wrapper can no
  // longer strand discovery at the first preloaded window (~30/59).
  function findSidebarCandidates() {
    const anchors = [...document.querySelectorAll('a[href]')].filter(a => config.convUrlRe?.test(a.href));
    const pool = new Set();
    for (const a of anchors.slice(0, 40)) {
      let e = a.parentElement;
      while (e && e !== document.documentElement) { pool.add(e); e = e.parentElement; }
    }
    for (const sel of ['nav', 'aside', '[role="navigation"]', '[class*="sidebar" i]', '[class*="history" i]', '[class*="chatList" i]', '[class*="nav-list" i]']) {
      try { document.querySelectorAll(sel).forEach(e => pool.add(e)); } catch {}
    }
    const scored = [];
    for (const el of pool) {
      if (!el.isConnected) continue;
      if (!(el.scrollHeight > el.clientHeight + 20)) continue;
      let count = 0;
      for (const a of anchors) if (el.contains(a)) count++;
      if (count <= 0) continue;
      // Anchor count dominates; real overflow styling breaks ties.
      scored.push({ el, score: count * (isScrollableEl(el) ? 100 : 1) });
    }
    scored.sort((a, b) => b.score - a.score);
    const out = [];
    for (const s of scored) {
      if (!out.includes(s.el)) out.push(s.el);
      if (out.length >= 4) break;
    }
    if (out.length) return out;
    const de = document.documentElement;
    if (de.scrollHeight > de.clientHeight + 20) return [de];
    // Short list / no scrollbar yet — still hand back something so the
    // engine can poll for hydration and "load more" controls.
    return [document.body];
  }

  // Resolve once page rendering has gone quiet (virtualizer finished
  // painting the current window). Bounded so slow platforms keep pace.
  function waitSidebarSettle() {
    return new Promise((resolve) => {
      const QUIET_MS = 350, MAX_MS = 1500;
      let quietT, maxT, obs;
      const done = () => {
        if (!obs) return;
        clearTimeout(quietT); clearTimeout(maxT);
        obs.disconnect(); obs = null;
        resolve();
      };
      maxT  = setTimeout(done, MAX_MS);
      quietT = setTimeout(done, QUIET_MS);
      obs = new MutationObserver(() => { clearTimeout(quietT); quietT = setTimeout(done, QUIET_MS); });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Click "Show more"-style pagination controls INSIDE the sidebar only —
  // never page-level buttons.
  function clickLoadMoreIn(container) {
    const root = container || document.body;
    for (const b of root.querySelectorAll('button,[role="button"],a')) {
      if (b.dataset.bsClicked) continue;
      const label = (b.getAttribute('aria-label') || b.innerText || '').trim().toLowerCase();
      if (/^(show|load|see)\s+(more|older)(\s|$)/.test(label) || label === 'more') {
        b.dataset.bsClicked = '1';
        b.click();
        return true;
      }
    }
    return false;
  }

  // Short human-readable descriptor of the element being scrolled (debug log).
  function describeEl(el) {
    if (!el) return 'null';
    const tag = (el.tagName || '?').toLowerCase();
    const id  = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `<${tag}${id}${cls}>`;
  }

  // body.scrollTop is a silent no-op in standards-mode pages — the real
  // window/document scroller is scrollingElement. Normalize once, use
  // consistently for reading AND writing so positions always match.
  function normalizeScrollTarget(el) {
    return (el && el !== document.body && el.isConnected !== false)
      ? el
      : (document.scrollingElement || document.documentElement || el);
  }

  // Wait until the sidebar has actually hydrated (≥1 conversation anchor).
  // Starting discovery earlier locks container-scoring onto an inert node,
  // which is exactly what capped large accounts at the first ~30-item DOM
  // window. Bounded so a genuinely empty account doesn't hang.
  function waitForSidebarReady(maxMs = 12000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const ready =
          [...document.querySelectorAll('a[href]')].some(a => config.convUrlRe?.test(a.href)) ||
          deepseekLocalChats(true).length > 0;
        if (ready || Date.now() - t0 > maxMs) {
          console.log(`[Brain Shadow][DISCOVERY] ${config.platform} sidebar ready: ${ready} (waited ${Date.now() - t0}ms)`);
          return resolve(ready);
        }
        setTimeout(tick, 500);
      };
      tick();
    });
  }

  // ── Discovery session state (one run per bulk import) ─────
  let disco = null;

  function newDiscoState() {
    return { running: false, done: false, error: null, reason: null, total: 0, stalled: false, chats: [], stopRequested: false };
  }

  let lastProgressSent = 0;
  function reportDiscoveryProgress(total, stalled) {
    disco.total = total;
    if (stalled !== undefined) disco.stalled = !!stalled;
    const t = Date.now();
    if (t - lastProgressSent < 800) return;
    lastProgressSent = t;
    try {
      // Fire-and-forget heartbeat to the service worker — doubles as an
      // MV3 keep-alive during long discoveries over huge accounts.
      chrome.runtime.sendMessage(
        { type: 'DISCOVERY_PROGRESS', platform: config.platform, discovered: total, stalled: !!stalled },
        () => void chrome.runtime.lastError
      );
    } catch {}
  }

  async function runFullDiscovery() {
    disco = newDiscoState();
    disco.running = true;
    deepseekLocalCache = null;
    console.log(`[Brain Shadow][DISCOVERY] ${config.platform} discovery started`);
    try {
      // Never score/lock the scroll container before the sidebar exists.
      await waitForSidebarReady();

      // Startup diagnostics: exactly which elements are scroll candidates.
      const cands = findSidebarCandidates();
      console.log(
        `[Brain Shadow][DISCOVERY][debug] ${config.platform} scroll candidates: ` +
        cands.map((el, i) =>
          `${i}:${describeEl(el)}(${el.scrollTop}/${el.scrollHeight}/${el.clientHeight})`
        ).join(' | ')
      );

      const hooks = {
        getContainers: findSidebarCandidates,
        getContainer: () => findSidebarCandidates()[0] || document.body,
        collectVisible: collectVisibleChats,
        getScrollInfo: (el) => {
          const t = normalizeScrollTarget(el);
          return t
            ? { scrollTop: t.scrollTop, clientHeight: t.clientHeight, scrollHeight: t.scrollHeight, scrollable: t.scrollHeight > t.clientHeight + 8 }
            : { scrollTop: 0, clientHeight: 0, scrollHeight: 0, scrollable: false };
        },
        scrollStep: (el) => {
          const t = normalizeScrollTarget(el);
          if (!t) return;
          const step = Math.min(800, Math.max(240, Math.floor((t.clientHeight || 600) * 0.8)));
          const maxScroll = Math.max(0, (t.scrollHeight || 0) - (t.clientHeight || 0));
          // Near the bottom edge, pull back first so the forward write is a
          // REAL scroll event crossing the load-older sentinel — some
          // infinite scrollers only react to actual downward movement.
          if (maxScroll > 10 && maxScroll - t.scrollTop < step * 0.6) {
            try { t.scrollTop = Math.max(0, maxScroll - 140); } catch {}
          }
          // Wheel event as well: virtualizers listening for wheel input
          // (not scrollTop writes) still receive a genuine signal.
          try {
            t.dispatchEvent(new WheelEvent('wheel', { deltaY: step, bubbles: true, cancelable: true }));
          } catch {}
          try { t.scrollTop += step; } catch {}
        },
        scrollToTop: (el) => { try { normalizeScrollTarget(el).scrollTop = 0; } catch {} },
        clickLoadMore: clickLoadMoreIn,
        wait: (ms) => new Promise(r => setTimeout(r, ms)),
        waitForSettle: waitSidebarSettle,
        now: () => Date.now(),
        onCycle: (d) => {
          console.log(
            `[Brain Shadow][DISCOVERY][debug] ${config.platform}` +
            ` scroll#${d.cycle} target=${describeEl(d.el)}` +
            ` scrollTop=${Math.round(d.scrollTop)} scrollHeight=${d.scrollHeight} clientHeight=${d.clientHeight}` +
            ` atBottom=${d.atBottom} newAfterScroll=${d.addedThisCycle} uniqueTotal=${d.uniqueTotal}` +
            ` stagnant=${d.stagnantCycles}/stable=${d.heightStableCycles}` +
            ` quietMs=${d.msSinceActivity} cands=${d.candidates ?? 1}` +
            `${d.stalled ? ' STALLING' : ''}` +
            (d.containerSwitches ? ` containerSwitches=${d.containerSwitches}` : '')
          );
        },
      };
      const result = await globalThis.BrainShadow.DiscoveryEngine.runDiscovery(
        hooks, {},
        (total, extra) => reportDiscoveryProgress(total, extra?.stalled),
        () => disco.stopRequested
      );
      disco.chats  = result.chats;
      disco.total  = result.total;
      disco.reason = result.reason;
      console.log(`[Brain Shadow][DISCOVERY] ${config.platform} end of chat list detected after ${result.cycles} cycles — reason: ${result.reason}, stats:`, result.stats);
    } catch (err) {
      disco.error = err?.message || String(err);
      console.error(`[Brain Shadow][DISCOVERY] ${config.platform} discovery error:`, disco.error);
    } finally {
      disco.done = true;
      disco.running = false;
      console.log(`[Brain Shadow][DISCOVERY] ${config.platform} total unique chats: ${disco.total}`);
    }
    return disco;
  }

  // ── Message listener ─────────────────────────────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Legacy single-call API — runs the FULL discovery before responding.
    if (request.type === 'GET_SIDEBAR_CHATS') {
      (async () => {
        if (!disco || (!disco.running && !disco.done)) await runFullDiscovery();
        else while (disco.running) await new Promise(r => setTimeout(r, 500));
        sendResponse(disco.chats.map(c => ({ url: c.url, title: c.title })));
      })().catch(() => sendResponse([]));
      return true;
    }
    // Two-phase protocol: background starts discovery, polls progress,
    // then fetches the complete chat list ONLY once discovery is done.
    if (request.type === 'START_DISCOVERY') {
      if (disco?.running)       sendResponse({ status: 'running', total: disco.total });
      else if (disco?.done)     sendResponse({ status: 'done', total: disco.total });
      else { runFullDiscovery(); sendResponse({ status: 'started' }); }
      return true;
    }
    if (request.type === 'DISCOVERY_POLL') {
      sendResponse({
        running: !!disco?.running,
        done: !!disco?.done,
        total: disco?.total || 0,
        stalled: !!disco?.stalled,
        error: disco?.error || null,
        reason: disco?.reason || null,
      });
      return true;
    }
    if (request.type === 'GET_DISCOVERED_CHATS') {
      sendResponse({ done: !!disco?.done, total: disco?.total || 0, chats: disco?.chats || [] });
      return true;
    }
    if (request.type === 'STOP_DISCOVERY') {
      if (disco) disco.stopRequested = true;
      sendResponse({ status: 'stopping' });
      return true;
    }
    if (request.type === 'RESET_DISCOVERY') {
      disco = null;
      deepseekLocalCache = null;
      document.querySelectorAll('[data-bs-clicked]').forEach(el => delete el.dataset.bsClicked);
      sendResponse({ status: 'reset' });
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
