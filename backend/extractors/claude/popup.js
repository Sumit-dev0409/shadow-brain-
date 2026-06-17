const statusEl        = document.getElementById("status");
const detailsEl       = document.getElementById("details");
const progressBar     = document.getElementById("progressBar");
const extractAllBtn   = document.getElementById("extractAllBtn");
const clearCacheBtn   = document.getElementById("clearCacheBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");

function setStatus(text, color = "#333") {
  statusEl.textContent  = text;
  statusEl.style.color  = color;
}

function setDetails(text) {
  detailsEl.textContent = text;
}

function setProgress(value) {
  progressBar.style.display = value > 0 ? "block" : "none";
  progressBar.value         = value;
}

// ── Progress updates from background ──────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "scrapeProgress") {
    setStatus(`Scanning ${message.current} of ${message.total} chats...`, "#333");
    setDetails(`${message.title} — ${message.messages || 0} messages extracted`);
    setProgress(message.percentage || 0);
  }
  if (message.action === "downloadStatus") {
    setStatus(message.message || "Download status updated.", "#333");
  }
});

// ── Retry helper ───────────────────────────────────────────
// Chrome injects content scripts slightly AFTER status === "complete",
// so we retry with a delay until the receiving end is ready.
function sendWithRetry(tabId, message, maxAttempts = 8, delayMs = 1200) {
  return new Promise(async (resolve, reject) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await new Promise((res) => {
        chrome.tabs.sendMessage(tabId, message, (r) => {
          if (chrome.runtime.lastError) {
            res({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            res({ ok: true, data: r });
          }
        });
      });

      if (result.ok) { resolve(result.data); return; }

      if (attempt === maxAttempts) { reject(new Error(result.error)); return; }

      setStatus(`Waiting for page to be ready… (${attempt}/${maxAttempts})`, "#888");
      await new Promise(r => setTimeout(r, delayMs));
    }
  });
}

// ── Main extraction flow ───────────────────────────────────
async function extractAllConversations() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url) {
    setStatus("No active tab detected.", "#c00");
    return;
  }

  if (!tab.url.includes("claude.ai")) {
    setStatus("Open Claude.ai before scanning conversations.", "#c00");
    return;
  }

  setDetails("");
  setProgress(0);

  // Navigate to /recents if not already there
  if (!tab.url.includes("/recents")) {
    setStatus("Navigating to Recents page...", "#333");
    await chrome.tabs.update(tab.id, { url: "https://claude.ai/recents" });

    // Wait for page-load complete, then give content script 1 s to register
    await new Promise((resolve) => {
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId === tab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          setTimeout(resolve, 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      setTimeout(resolve, 6000); // hard fallback
    });
  }

  setStatus("Collecting chat list from Recents (scrolling to load all)...", "#333");

  // Ask content script to extract the recents list — retries until ready
  let response;
  try {
    response = await sendWithRetry(tab.id, { action: "extractRecents" });
  } catch (err) {
    setStatus(
      "Refresh claude.ai/recents, wait a few seconds, then try again.",
      "#c00",
    );
    setDetails("(Content script not reachable — the tab may still be loading)");
    return;
  }

  if (!response || !response.threads) {
    setStatus("Could not read the chat list from Recents.", "#c00");
    return;
  }

  const threads = response.threads || [];
  if (threads.length === 0) {
    setStatus("No chat threads found on the Recents page.", "#666");
    return;
  }

  setStatus(`Found ${threads.length} chats! Starting full scan...`, "#333");
  setDetails("Extracting messages from all conversations...");
  setProgress(1);

  // Hand off to background service worker
  chrome.runtime.sendMessage({ action: "scrapeAllConversations", threads }, (result) => {
    if (chrome.runtime.lastError) {
      setStatus(`Error: ${chrome.runtime.lastError.message}`, "#c00");
      return;
    }

    if (!result || !Array.isArray(result.conversations)) {
      setStatus("Extraction failed while scanning chats.", "#c00");
      return;
    }

    const totalNewMessages = result.conversations.reduce(
      (acc, conv) => acc + (conv.newMessagesCount || 0), 0,
    );
    const totalChats = result.conversations.filter(c => c.newMessagesCount > 0).length;

    setStatus(`✓ Complete! ${totalChats} chats — ${totalNewMessages} messages`, "#0a0");
    setDetails("JSON auto-downloading…");
    setProgress(100);
    downloadJsonBtn.style.display = "inline-block";
  });
}

extractAllBtn.addEventListener("click", extractAllConversations);

// ── Download JSON ──────────────────────────────────────────
downloadJsonBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "EXPORT_DATA" }, (data) => {
    if (!data) { setStatus("No data to download.", "#c00"); return; }

    const json     = JSON.stringify(data, null, 2);
    const dataUrl  = "data:application/json;charset=utf-8," + encodeURIComponent(json);
    const filename = `brain_shadow_claude_${new Date().toISOString().slice(0, 10)}.json`;

    chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, () => {
      setStatus("✓ Downloaded!", "#0a0");
      setTimeout(() => setStatus(""), 2000);
    });
  });
});

// ── Clear cache ────────────────────────────────────────────
clearCacheBtn.addEventListener("click", () => {
  if (!confirm("Clear all saved Brain Shadow data? This cannot be undone.")) return;

  chrome.runtime.sendMessage({ type: "CLEAR_DATA" }, () => {
    setStatus("✓ All data cleared.", "#0a0");
    setDetails("You can now scan again to re-process all conversations.");
    setProgress(0);
    downloadJsonBtn.style.display = "none";
    setTimeout(() => { setStatus(""); setDetails(""); }, 3000);
  });
});
