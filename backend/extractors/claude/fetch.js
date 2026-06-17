// === OVERLAY DISPLAY ===
let overlayElement = null;

function createOrUpdateOverlay(data) {
  try {
    if (!overlayElement) {
      overlayElement = document.createElement("div");
      overlayElement.id = "claude-scan-overlay";
      overlayElement.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 300px;
        word-break: break-word;
      `;
      document.body.appendChild(overlayElement);
    }

    const progress = data.percentage || 0;
    overlayElement.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>🔄 Scanning Conversations</strong></div>
      <div style="font-size: 12px; margin-bottom: 6px;">${data.current || 0} / ${data.total || 0} chats</div>
      <div style="width: 280px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden;">
        <div style="width: ${progress}%; height: 100%; background: #4CAF50; border-radius: 2px;"></div>
      </div>
      <div style="font-size: 11px; margin-top: 6px; color: rgba(255,255,255,0.8);">${progress}% - ${data.title || "Loading..."}</div>
    `;
  } catch (err) {
    console.error("[Claude Extractor] Overlay error:", err);
  }
}

function removeOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

// === MESSAGE LISTENER - Register FIRST ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrapeProgress") {
    createOrUpdateOverlay(request);
    return;
  }

  if (request.action === "scrapeDone") {
    removeOverlay();
    return;
  }

  if (request.action === "extractRecents") {
    // First, scroll to load ALL chats on the Recents page
    scrollToLoadAllChats().then(() => {
      sendResponse(extractRecents());
    });
    return true;
  }

  if (
    request.action === "extractConversation" ||
    request.action === "extractCurrent"
  ) {
    extractConversation().then((result) => {
      if (request.action === "extractConversation") {
        chrome.runtime.sendMessage({
          action: "conversationExtracted",
          data: result,
        });
      }
      sendResponse(result);
    });
    return true;
  }
});

// === HELPER FUNCTIONS ===
function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function isVisible(node) {
  if (!(node instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(node);
  return (
    style &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

function detectRole(node) {
  const text =
    (node.getAttribute("data-testid") || "") +
    " " +
    (node.getAttribute("aria-label") || "") +
    " " +
    node.className;
  const normalized = text.toLowerCase();

  if (normalized.includes("user")) return "user";
  if (
    normalized.includes("assistant") ||
    normalized.includes("response") ||
    normalized.includes("ai")
  )
    return "assistant";

  const roleLabel = node.querySelector(
    '[data-testid*="role"], [aria-label*="role"]',
  );
  if (roleLabel) {
    const labelText = roleLabel.innerText.toLowerCase();
    if (labelText.includes("user")) return "user";
    if (labelText.includes("assistant")) return "assistant";
  }

  return "assistant";
}

function getRootElement() {
  const roots = [
    "main",
    '[role="main"]',
    ".chat-main",
    ".conversation",
    ".chat-container",
    ".message-list",
  ];
  for (const selector of roots) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return document.body;
}

// === MAIN EXTRACTION FUNCTION ===
async function extractConversation() {
  const root = getRootElement();
  const selectors = [
    '[data-testid^="message"]',
    '[data-testid*="assistant"]',
    '[data-testid*="user"]',
    '[class*="message"]',
    '[class*="bubble"]',
    '[class*="chat"]',
    '[role="listitem"]',
    "article",
    "section",
  ];

  const nodes = new Set();
  selectors.forEach((selector) => {
    root.querySelectorAll(selector).forEach((node) => {
      if (
        node &&
        node.innerText &&
        normalizeText(node.innerText).length >= 10
      ) {
        nodes.add(node);
      }
    });
  });

  if (nodes.size === 0) {
    root.querySelectorAll("div, li, article, section").forEach((node) => {
      if (!node.innerText) return;
      const text = normalizeText(node.innerText);
      if (text.length < 20) return;
      if (!isVisible(node)) return;
      const trimmed = text.toLowerCase();
      if (
        trimmed.includes("search") ||
        trimmed.includes("new chat") ||
        trimmed.includes("filter by")
      )
        return;
      if (trimmed.length > 20 && node.children.length < 10) {
        nodes.add(node);
      }
    });
  }

  const messages = Array.from(nodes)
    .map((node) => {
      const text = normalizeText(node.innerText);
      if (!text || text.length < 5) return null;

      return {
        role: detectRole(node),
        text,
        uniqueKey: `${window.location.pathname}|${text}`,
      };
    })
    .filter(Boolean);

  // Dont save existing data: export everything found in this conversation scan.
  console.log(`[Claude Extractor] Exporting messages: ${messages.length}`);

  return {
    total: messages.length,
    newCount: messages.length,
    newMessages: messages,
  };
}

// === RECENTS PAGE PARSER ===
function extractRecents() {
  const links = Array.from(document.querySelectorAll("a[href]"));
  const seen = new Set();
  const threads = [];

  links.forEach((link) => {
    const href = link.href;
    if (!href.includes("claude.ai")) return;
    if (
      href.includes("/recents") ||
      href.includes("/settings") ||
      href.includes("/help") ||
      href.includes("/login") ||
      href.includes("mailto:")
    )
      return;
    if (
      !href.includes("/chat") &&
      !href.includes("/conversation") &&
      !href.includes("/threads") &&
      !href.includes("/c/")
    )
      return;

    let title = normalizeText(
      link.innerText || link.getAttribute("aria-label") || "",
    );
    if (!title || title.length < 3) {
      const titleEl = link.querySelector("div, span, h2, h3, p");
      if (titleEl) title = normalizeText(titleEl.innerText || "");
    }
    if (!title || title.length < 3) return;

    const key = `${href}|${title}`;
    if (seen.has(key)) return;
    seen.add(key);
    threads.push({ url: href, title });
  });

  return { threads };
}

// === SCROLL TO LOAD ALL CHATS ===
async function scrollToLoadAllChats() {
  return new Promise((resolve) => {
    let lastHeight = document.body.scrollHeight;
    let scrollCount = 0;
    const maxScrolls = 100; // Safety limit

    const scrollInterval = setInterval(() => {
      // Scroll down
      window.scrollBy(0, window.innerHeight);
      scrollCount++;

      // Check if we've reached bottom or hit max scrolls
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight || scrollCount >= maxScrolls) {
        clearInterval(scrollInterval);
        // Scroll back to top
        window.scrollTo(0, 0);
        resolve();
        return;
      }

      lastHeight = newHeight;
    }, 300); // Wait 300ms between scrolls to load content
  });
}
