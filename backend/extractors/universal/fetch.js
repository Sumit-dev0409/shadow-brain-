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
    asstSel:    ['[data-message-author-role="assistant"]', '.markdown', '[class*="prose"]'],
    streaming:  ['button[data-testid="stop-button"]', 'button[aria-label="Stop generating"]', '.result-streaming'],
    extractId:  url => url.match(/\/c\/([\w\-]+)/)?.[1] || url,
    titleClean: t => t.replace(' - ChatGPT', '').replace(' | ChatGPT', ''),
  };
}

function claudeConfig() {
  function detectRole(node) {
    const text = [node.getAttribute('data-testid') || '', node.getAttribute('aria-label') || '', node.className || ''].join(' ').toLowerCase();
    if (text.includes('human') || text.includes('user')) return 'user';
    return 'assistant';
  }
  return {
    platform:   'claude',
    convUrlRe:  /\/(?:chat|c|conversation)\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[data-testid*="human"]', '[data-testid*="user"]', '[class*="humanMessage"]'],
    asstSel:    ['[data-testid*="assistant"]', '[class*="assistantMessage"]', '[class*="prose"]', '[class*="font-claude-message"]'],
    streaming:  ['button[aria-label="Stop generating"]', 'button[aria-label="Stop response"]', '[data-testid="stop-button"]', '.stop-button', '[class*="stop-button"]'],
    extractId:  url => { const m = url.match(/\/(?:chat|c|conversation)\/([\w\-]+)/); return m?.[1] || url; },
    titleClean: t => t.replace(' - Claude', '').replace(' | Claude', ''),
    scrapeOverride() {
      const root = document.querySelector('main,[role="main"],.chat-main') || document.body;
      const selectors = ['[data-testid^="message"]', '[data-testid*="human"]', '[data-testid*="assistant"]', '[class*="message"]', '[class*="bubble"]', '[role="listitem"]', 'article'];
      const nodes = new Set();
      selectors.forEach(sel => { root.querySelectorAll(sel).forEach(node => { if (node.innerText && node.innerText.trim().length >= 10) nodes.add(node); }); });
      if (nodes.size === 0) {
        root.querySelectorAll('div,li,article').forEach(node => {
          if (!node.innerText) return;
          const text = node.innerText.trim();
          if (text.length < 20 || node.children.length >= 10) return;
          const s = window.getComputedStyle(node);
          if (s.display === 'none' || s.visibility === 'hidden') return;
          nodes.add(node);
        });
      }
      let messages = Array.from(nodes).map(node => { const content = node.innerText.trim(); if (!content || content.length < 5) return null; return { role: detectRole(node), content }; }).filter(Boolean);
      return messages;
    },
  };
}

function geminiConfig() {
  return {
    platform:   'gemini',
    convUrlRe:  /\/app\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['user-query', '.user-query', '[data-message-author-role="user"]', '.user-request-text', '.query-text', '[class*="user-query"]', '[class*="human-turn"]'],
    asstSel:    ['model-response', '.model-response', '[data-message-author-role="model"]', '.response-content', '.model-response-text', 'message-content', '[class*="model-response"]', '[class*="ai-turn"]'],
    streaming:  ['button[aria-label="Stop generating"]', 'button[aria-label="Stop response"]', '[data-test-id="stop-stream-button"]', '.stop-button', '[class*="stop-button"]', '.loading-indicator', '[class*="loading-indicator"]', 'mat-progress-bar'],
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
    userSel:    ['[class*="userMessage"]', '[class*="user-message"]', '[class*="userContent"]', '[class*="humanMessage"]', '[class*="human-message"]', '[class*="userBubble"]', '[data-role="user"]', '[data-message-role="user"]'],
    asstSel:    ['.ds-markdown', '[class*="ds-markdown"]', '[class*="assistantMessage"]', '[class*="assistant-message"]', '[class*="aiMessage"]', '[class*="deepseekMessage"]', '[class*="markdownContent"]', '[class*="responseContent"]', '[data-role="assistant"]', '[data-message-role="assistant"]'],
    streaming:  ['[class*="stopButton"]', '[class*="stop-button"]', 'button[aria-label*="Stop" i]', '[class*="generating"]', '[class*="ds-loading"]', '.ds-loading'],
    extractId:  url => { try { const p = new URL(url).pathname.split('/').filter(Boolean); const i = p.findLastIndex(x=>x==='chat'); if(i!==-1){const after=p.slice(i+1);const u=after.find(s=>s.length>=8&&s!=='s');if(u)return u;} return p[p.length-1]; } catch { return url; } },
    titleClean: t => t.replace(' - DeepSeek', '').replace(' | DeepSeek', ''),
  };
}

function mscopilotConfig() {
  return {
    platform:   'copilot',
    convUrlRe:  /\/(?:c|chats|chat|thread|threads|conversation|conversations)\/([a-zA-Z0-9_\-]{4,})/,
    userSel:    ['[data-testid*="user-message"]', '[class*="userMessage"]', '[aria-label*="You said" i]'],
    asstSel:    ['[data-testid*="copilot-message"]', '[class*="copilotMessage"]', '[class*="BotBubble"]', '[class*="markdown"]'],
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
      // ── User query: from URL slug (always works) ───────────
      const slug  = location.pathname.split('/').filter(Boolean).pop() || '';
      const query = slug.replace(/-[A-Za-z0-9]{6,}$/, '').replace(/-/g, ' ').trim()
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
    asstSel:    ['[data-testid*="grok-message"]', '[class*="GrokMessage"]', '[class*="AssistantMessage"]', '[class*="markdown"]'],
    streaming:  ['button[aria-label="Stop generating"]', '[class*="StopButton"]', '[class*="thinking"]'],
    extractId:  url => { const m = url.match(/\/(?:chat|c|conversation)\/([\w\-]+)/); return m?.[1] || url; },
    titleClean: t => t.replace(' | Grok', '').replace(' - Grok', ''),
  };
}

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
    // Strategy 1: walk up from a message element to find scrollable parent
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
    // Strategy 2: probe known Gemini virtual-scroll containers
    if (config.platform === 'gemini') {
      for (const sel of ['[class*="scroll-container"]', '[class*="conversation"]', '[role="region"]', 'main', '[class*="content"]']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const s = window.getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) return el;
      }
    }
    // Strategy 3: find any scrollable element inside main that is tall enough
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
    for (const sel of (config.userSel || [])) count += document.querySelectorAll(sel).length;
    for (const sel of (config.asstSel || [])) count += document.querySelectorAll(sel).length;
    return count;
  }

  function scrollToLoadAllMessages() {
    return new Promise((resolve) => {
      const c   = getConversationContainer();
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

  // ── Sibling fallback for DeepSeek dynamic layout ─────────
  function findConversationContainer(asstEls) {
    if (!asstEls || !asstEls.length) return null;
    let card = asstEls[0];
    let container = card.parentElement;
    const isAsst = (el) => asstEls.some(ae => el === ae || el.contains(ae));
    while (container && container !== document.body) {
      const siblings = [...container.children];
      if (siblings.some(sib => !isAsst(sib) && sib.innerText?.trim().length > 3)) return { container, card };
      card = container;
      container = container.parentElement;
    }
    return null;
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

  function scrapeConversation() {
    // Platform-specific override (e.g. Claude with dynamic role detection)
    if (config.scrapeOverride) {
      const messages = config.scrapeOverride();
      if (!messages || messages.length === 0) return null;
      const deduped = deduplicateConsecutiveRoles(messages);
      const last = deduped[deduped.length - 1];
      if (!last || last.role !== 'assistant') return null;
      const timed = assignRelativeTimestamps(deduped);
      const external_id = config.extractId ? config.extractId(location.href) : location.href;
      const rawTitle    = document.title || '';
      const title       = (config.titleClean ? config.titleClean(rawTitle) : rawTitle).trim() || external_id;
      const uCount = timed.filter(m => m.role === 'user').length;
      const aCount = timed.filter(m => m.role === 'assistant').length;
      console.log(`[${config.platform}] Messages extracted: ${timed.length} total (${uCount}U / ${aCount}A) — "${title}"`);
      return { platform: config.platform, external_id, url: location.href, title, message_count: timed.length, messages: timed, captured_at: new Date().toISOString() };
    }

    let userEls = [], asstEls = [];
    for (const sel of (config.userSel || [])) { const f = [...document.querySelectorAll(sel)]; if (f.length) { userEls = f; break; } }
    for (const sel of (config.asstSel || [])) { const f = [...document.querySelectorAll(sel)]; if (f.length) { asstEls = f; break; } }

    // Sibling fallback for DeepSeek (dynamic layout — user messages may lack selectors)
    if (config.platform === 'deepseek' && asstEls.length > 0 && userEls.length === 0) {
      const found = findConversationContainer(asstEls);
      if (found) {
        const { container } = found;
        const kids = [...container.children];
        const nu = [], na = [];
        for (const kid of kids) {
          const isA = asstEls.some(ae => kid === ae || kid.contains(ae));
          const t = kid.innerText?.trim();
          if (!t || t.length <= 1) continue;
          if (isA) na.push(...asstEls.filter(ae => kid === ae || kid.contains(ae)));
          else nu.push(kid);
        }
        if (nu.length) { userEls = nu; asstEls = na; }
      }
    }

    // Container fallback
    if (!userEls.length && !asstEls.length) {
      for (const sel of ['[class*="chatContent"]','[class*="messageList"]','[class*="conversation"]','main']) {
        const c = document.querySelector(sel);
        if (!c) continue;
        const children = [...c.children].filter(el => el.innerText?.trim().length > 3);
        if (children.length >= 2) { children.forEach((el, i) => (i % 2 === 0 ? userEls : asstEls).push(el)); break; }
      }
    }

    if (!userEls.length && !asstEls.length) {
      console.log(`[${config.platform}] No message elements found (userEls=${userEls.length}, asstEls=${asstEls.length})`);
      return null;
    }
    console.log(`[${config.platform}] scrapeConversation found userEls=${userEls.length} asstEls=${asstEls.length}`);

    const allItems = [
      ...userEls.map(el => ({ el, role: 'user' })),
      ...asstEls.map(el => ({ el, role: 'assistant' })),
    ].sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
      return 0;
    });

    let messages = allItems
      .map(({ el, role }) => { const content = el.innerText?.trim(); return content && content.length > 3 ? { role, content } : null; })
      .filter(Boolean);

    console.log(`[${config.platform}] Captured ${allItems.length} raw items → ${messages.length} filtered messages`);
    console.log(`[${config.platform}] First role=${messages[0]?.role} Last role=${messages[messages.length-1]?.role} Count=${messages.length}`);

    messages = deduplicateConsecutiveRoles(messages);
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') {
      console.log(`[${config.platform}] Conversation incomplete — skipping (last role: ${last?.role || 'none'})`);
      return null;
    }
    messages = assignRelativeTimestamps(messages);

    const external_id = config.extractId ? config.extractId(location.href) : location.href;
    const rawTitle    = document.title || '';
    const title       = (config.titleClean ? config.titleClean(rawTitle) : rawTitle).trim() || external_id;

    const uCount = messages.filter(m => m.role === 'user').length;
    const aCount = messages.filter(m => m.role === 'assistant').length;
    console.log(`[${config.platform}] Messages extracted: ${messages.length} total (${uCount}U / ${aCount}A) — "${title}"`);
    return { platform: config.platform, external_id, url: location.href, title, message_count: messages.length, messages, captured_at: new Date().toISOString() };
  }

  // ── Capture pipeline ─────────────────────────────────────
  let isCapturing = false;

  async function captureAndSend(scroll = false) {
    if (isCapturing) return { status: 'busy' };
    isCapturing = true;
    try {
      console.log(`[${config.platform}] Conversation opened — capturing...`);
      await waitForStreamingToFinish();
      if (scroll) {
        await scrollToLoadAllMessages();
      } else {
        // Auto-capture: do a gentle single pass so Gemini loads at least what's visible
        const c = getConversationContainer();
        c.scrollTop = 0;
        await new Promise(r => setTimeout(r, 300));
        c.scrollTop = c.scrollHeight;
        await new Promise(r => setTimeout(r, 1000));
      }
      const conversation = scrapeCustom() || scrapeConversation();
      if (!conversation) {
        console.log(`[${config.platform}] No conversation data to capture`);
        return { status: 'empty' };
      }
      console.log(`[${config.platform}] Sending conversation to background (ID: ${conversation.external_id}, messages: ${conversation.messages.length})`);
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'SAVE_CONVERSATION', payload: conversation },
          (r) => resolve(chrome.runtime.lastError ? { status: 'error', error: chrome.runtime.lastError.message } : (r || { status: 'unknown' })));
      });
      console.log(`[${config.platform}] Save result: ${result.status}${result.reason ? ' ('+result.reason+')' : ''}${result.synced ? ' · synced' : ''}`);
      return { ...result, title: conversation.title, message_count: conversation.messages.length };
    } finally { isCapturing = false; }
  }

  // ── MutationObserver ─────────────────────────────────────
  let debounceTimer = null;
  const observer = new MutationObserver(() => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => captureAndSend(false), 3000); });

  function waitForChatAndObserve() {
    observer.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
    console.log(`[Brain Shadow] Observer attached (${config.platform})`);
    setTimeout(captureAndSend, 3500);
  }

  // ── SPA navigation watcher ───────────────────────────────
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      console.log(`[${config.platform}] Moving to next conversation`);
      lastUrl = location.href;
      setTimeout(() => captureAndSend(true), 4000);
    }
  }).observe(document, { subtree: true, childList: true });

  // ── Sidebar: get conversation list ───────────────────────
  function extractRecents() {
    // DeepSeek: localStorage FIRST (sidebar isn't <a> tags)
    if (host === 'chat.deepseek.com') {
      try {
        const dsSeen = new Set(), dsThreads = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          let raw; try { raw = JSON.parse(localStorage.getItem(key)); } catch { continue; }
          const data = raw?.state ?? raw;
          const candidates = typeof data === 'object' && data !== null ? Object.values(data) : [data];
          for (const val of candidates) {
            if (!Array.isArray(val)) continue;
            for (const item of val) {
              if (typeof item !== 'object' || !item) continue;
              const id    = item.id || item.sessionId || item.chatId || item.conversationId;
              const title = item.title || item.name || item.subject || `DeepSeek chat`;
              if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_\-]{6,}$/.test(id)) continue;
              const url = `${location.origin}/a/chat/s/${id}`;
              if (!dsSeen.has(url)) { dsSeen.add(url); dsThreads.push({ url, title: String(title).slice(0, 120) }); }
            }
          }
        }
        if (dsThreads.length > 0) { console.log(`[Brain Shadow] DeepSeek localStorage: ${dsThreads.length} found`); return dsThreads; }
      } catch {}
    }

    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    console.log(`[${config.platform}] <a> tags: ${allLinks.length}`);
    console.log(`[${config.platform}] ALL hrefs:\n` + [...new Set(allLinks.map(a => a.getAttribute('href')))].slice(0, 50).join('\n'));

    const seen = new Set(), threads = [];

    // Pass 1 — platform-specific regex
    for (const link of allLinks) {
      const href = link.href || '';
      if (config.convUrlRe && !config.convUrlRe.test(href)) continue;
      let canonical; try { const u = new URL(href); canonical = `${u.origin}${u.pathname}`; } catch { continue; }
      if (seen.has(canonical)) continue; seen.add(canonical);
      const title = link.getAttribute('aria-label')?.trim() || link.getAttribute('title')?.trim() ||
        link.querySelector('span,p,div,h1,h2,h3')?.innerText?.trim() || link.innerText?.trim() ||
        `Chat ${threads.length + 1}`;
      threads.push({ url: canonical, title: title.slice(0, 120) });
    }

    // Pass 2 — broad UUID scan (always runs to catch sidebar links regex misses)
    const regexCount = threads.length;
    {
      console.log(`[Brain Shadow] Broad UUID scan...`);
      const SKIP = /\/(login|signup|settings|help|about|privacy|terms|logout|new|upgrade|billing|home|discover)\b/i;
      for (const link of allLinks) {
        let u; try { u = new URL(link.href); } catch { continue; }
        if (u.origin !== location.origin) continue;
        if (SKIP.test(u.pathname) || u.pathname.length < 4) continue;
        if (!u.pathname.split('/').filter(Boolean).some(s => /^[a-zA-Z0-9_\-]{6,}$/.test(s))) continue;
        const canonical = `${u.origin}${u.pathname}`;
        if (seen.has(canonical)) continue; seen.add(canonical);
        const title = link.getAttribute('aria-label')?.trim() || link.querySelector('span,p,div')?.innerText?.trim() || link.innerText?.trim() || `Chat ${threads.length + 1}`;
        threads.push({ url: canonical, title: title.slice(0, 120) });
      }
      const broadFound = threads.length - regexCount;
      if (broadFound > 0) console.log(`[Brain Shadow] Broad scan found ${broadFound} additional`);
    }

    console.log(`[${config.platform}] Conversation discovered: ${threads.length} total`);
    threads.forEach((t, i) => console.log(`[${config.platform}]   [${i+1}] ${t.title} — ${t.url}`));
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
      const sels = ['nav','aside','[role="navigation"]','[class*="sidebar"]','[class*="Sidebar"]','[class*="history"]','[class*="chatList"]','[aria-label*="history" i]','[aria-label*="Recent" i]'];
      if (config.platform === 'gemini' || config.platform === 'deepseek') sels.push('[class*="nav"]','[class*="menu"]');
      if (config.platform === 'deepseek') sels.push('[class*="historyList"]','[class*="sessionList"]');
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          const s = window.getComputedStyle(el);
          if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) { sidebar = el; break; }
        }
        if (sidebar) break;
      }
    }
    const target = sidebar || document.documentElement;
    return new Promise((resolve) => {
      let lastH = target.scrollHeight, count = 0;
      const tick = setInterval(() => {
        target.scrollBy(0, target.clientHeight || 500); count++;
        const newH = target.scrollHeight;
        if (newH === lastH || count >= 100) { clearInterval(tick); target.scrollTo(0, 0); setTimeout(resolve, 400); }
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
