// ============================================================
// BRAIN SHADOW — SELECTOR DEBUGGER
// Paste this entire script into ChatGPT's browser console
// while a conversation is open, then run: debugSelectors()
// ============================================================

function debugSelectors() {
  console.log('=== Brain Shadow Selector Debug ===');
  console.log('URL:', window.location.href);
  console.log('Title:', document.title);
  console.log('');

  // Test all known selectors
  const tests = [
    // Current / old ChatGPT selectors
    '[data-message-author-role]',
    '[data-message-id]',
    '[data-testid*="conversation"]',
    '[data-testid*="message"]',
    
    // Class-based (ChatGPT uses hashed classes, but some stable ones exist)
    '.message',
    '.group',
    
    // Role-based article tags
    'article',
    '[role="article"]',
    
    // Common wrapper patterns
    'main [class*="prose"]',
    'main .markdown',
    '.markdown',
    
    // Turn-based patterns
    '[data-testid="user-turn"]',
    '[data-testid="assistant-turn"]',
    '[data-testid="conversation-turn"]',
    
    // New ChatGPT patterns (2024-2025)
    '[class*="turn"]',
    '[class*="message"]',
    '[class*="agent-turn"]',
    '[class*="human-turn"]',
    
    // Sidebar / nav
    'nav a[href*="/c/"]',
    'a[href*="/c/"]',
    '[class*="conversation"] a',
    
    // Generic fallbacks
    'main p',
    'main div[class]'
  ];

  tests.forEach(selector => {
    try {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) {
        console.log(`✅ FOUND [${els.length}x]: ${selector}`);
        // Show first element's classes and text preview
        const first = els[0];
        const textPreview = first.innerText?.substring(0, 60)?.replace(/\n/g, ' ') || '';
        console.log(`   → classes: "${first.className?.substring(0, 80)}"`);
        console.log(`   → text: "${textPreview}"`);
      }
    } catch(e) {
      // invalid selector, skip
    }
  });

  console.log('');
  console.log('=== Sidebar Link Check ===');
  const navLinks = document.querySelectorAll('a[href*="/c/"]');
  console.log(`Found ${navLinks.length} conversation links`);
  if (navLinks.length > 0) {
    console.log('First link:', navLinks[0].href, '|', navLinks[0].innerText?.trim());
  }

  console.log('');
  console.log('=== Main Content Area ===');
  const main = document.querySelector('main');
  if (main) {
    console.log('main element found');
    // Get all direct children with content
    const children = Array.from(main.children);
    children.forEach((child, i) => {
      if (child.innerText?.trim().length > 20) {
        console.log(`  child[${i}]: <${child.tagName}> class="${child.className?.substring(0, 60)}" text="${child.innerText?.substring(0, 50)}"`);
      }
    });
  } else {
    console.log('❌ No <main> element found');
  }

  console.log('');
  console.log('=== Article Tags ===');
  document.querySelectorAll('article').forEach((a, i) => {
    const role = a.getAttribute('data-message-author-role') || a.getAttribute('role') || 'unknown';
    console.log(`article[${i}]: role="${role}" class="${a.className?.substring(0, 60)}" text="${a.innerText?.substring(0, 50)}"`);
  });

  console.log('');
  console.log('=== COPY THIS OUTPUT AND SHARE WITH DEV ===');
}

debugSelectors();
