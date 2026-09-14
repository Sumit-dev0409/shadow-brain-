// content/shadowbrain.js
console.log('[Brain Shadow Extension] Client Bridge Content Script Loaded');

// 1. Scan on load
function findToken() {
  const el = document.getElementById('shadowbrain-auth-bridge');
  if (el) {
    const token = el.getAttribute('data-token');
    if (token) {
      console.log('[Brain Shadow Extension] Found JWT token on page load');
      chrome.runtime.sendMessage({ type: 'SET_JWT', token });
    }
  }
}

// 2. Poll briefly in case of slow hydration
let attempts = 0;
const interval = setInterval(() => {
  findToken();
  attempts++;
  if (attempts > 10) clearInterval(interval);
}, 1000);

// 3. Listen for postMessage updates (real-time login/logout)
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHADOWBRAIN_LOGIN') {
    console.log('[Brain Shadow Extension] Received login postMessage event');
    chrome.runtime.sendMessage({ type: 'SET_JWT', token: event.data.token });
  } else if (event.data && event.data.type === 'SHADOWBRAIN_LOGOUT') {
    console.log('[Brain Shadow Extension] Received logout postMessage event');
    chrome.runtime.sendMessage({ type: 'SET_JWT', token: null });
  }
});
