// shadowbrain.js — Content script bridge (injected on web app origin only)
console.log('[JWT-STEP-4] ═══ shadowbrain.js loaded ═══');
console.log(`[JWT-STEP-4]   Current URL: ${window.location.href}`);
console.log(`[JWT-STEP-4]   document.readyState: ${document.readyState}`);

// Track all messages received for debugging
let domBridgeFired = false;
let postMessageBridgeFired = false;
let jwtSentToBackground = false;

// 1. DOM Bridge — poll for #shadowbrain-auth-bridge div
function findToken() {
  const el = document.getElementById('shadowbrain-auth-bridge');
  if (el) {
    const token = el.getAttribute('data-token');
    if (token) {
      domBridgeFired = true;
      console.log(`[JWT-STEP-4] ═══ DOM BRIDGE — found #shadowbrain-auth-bridge ═══`);
      console.log(`[JWT-STEP-4]   token type: ${typeof token}`);
      console.log(`[JWT-STEP-4]   token length: ${token.length}`);
      console.log(`[JWT-STEP-4]   token preview: ${token.slice(0, 40)}...`);
      console.log(`[JWT-STEP-4]   token full: ${JSON.stringify(token)}`);
      console.log(`[JWT-STEP-4]   Sending SET_JWT to background...`);
      chrome.runtime.sendMessage({ type: 'SET_JWT', token }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[JWT-STEP-4] ❌ FAIL — chrome.runtime.sendMessage error: ${chrome.runtime.lastError.message}`);
        } else {
          jwtSentToBackground = true;
          console.log(`[JWT-STEP-4] ✅ PASS — SET_JWT sent via DOM bridge, response:`, response);
        }
      });
    }
  }
}

// 2. Poll briefly in case of slow hydration
let attempts = 0;
const interval = setInterval(() => {
  findToken();
  attempts++;
  if (attempts > 10) {
    clearInterval(interval);
    console.log(`[JWT-STEP-4] DOM bridge polling stopped after ${attempts} attempts. domBridgeFired=${domBridgeFired}`);
    if (!domBridgeFired && !postMessageBridgeFired) {
      console.error(`[JWT-STEP-4] ❌ FAIL — Neither bridge fired after 10 seconds`);
      console.error(`[JWT-STEP-4]   #shadowbrain-auth-bridge div was never found in DOM`);
      console.error(`[JWT-STEP-4]   This means page.tsx never rendered the div (token state was null)`);
    }
  }
}, 1000);

// 3. Listen for postMessage updates (real-time login/logout)
window.addEventListener('message', (event) => {
  // Log ALL messages received for debugging
  if (event.data?.type?.startsWith?.('SHADOWBRAIN_')) {
    console.log(`[JWT-STEP-4] ═══ postMessage received ═══`);
    console.log(`[JWT-STEP-4]   type: ${event.data.type}`);
    console.log(`[JWT-STEP-4]   has token: ${!!event.data.token}`);
    console.log(`[JWT-STEP-4]   token type: ${typeof event.data.token}`);
    console.log(`[JWT-STEP-4]   token length: ${event.data.token?.length ?? 0}`);
    console.log(`[JWT-STEP-4]   token preview: ${event.data.token ? event.data.token.slice(0, 40) + '...' : 'N/A'}`);
    console.log(`[JWT-STEP-4]   token full: ${JSON.stringify(event.data.token)}`);
    console.log(`[JWT-STEP-4]   origin: ${event.origin}`);
    console.log(`[JWT-STEP-4]   source: ${event.source === window ? 'window (self)' : 'other'}`);
  }

  if (event.data && event.data.type === 'SHADOWBRAIN_LOGIN') {
    postMessageBridgeFired = true;
    const token = event.data.token;
    if (token) {
      console.log(`[JWT-STEP-4] ✅ PASS — postMessage bridge: valid token received`);
      console.log(`[JWT-STEP-4]   Sending SET_JWT to background...`);
      chrome.runtime.sendMessage({ type: 'SET_JWT', token }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[JWT-STEP-4] ❌ FAIL — chrome.runtime.sendMessage error: ${chrome.runtime.lastError.message}`);
        } else {
          jwtSentToBackground = true;
          console.log(`[JWT-STEP-4] ✅ PASS — SET_JWT sent via postMessage bridge, response:`, response);
        }
      });
    } else {
      console.error(`[JWT-STEP-4] ❌ FAIL — postMessage received but token is empty/null`);
    }
  } else if (event.data && event.data.type === 'SHADOWBRAIN_LOGOUT') {
    console.log(`[JWT-STEP-4] Received logout postMessage event`);
    chrome.runtime.sendMessage({ type: 'SET_JWT', token: null });
  }
});

console.log(`[JWT-STEP-4] Content script ready. Waiting for bridges...`);
