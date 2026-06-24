// ============================================================
// Brain Shadow — DeepSeek Diagnostics
// Paste this in DevTools Console on chat.deepseek.com
// Share the full output so the extractor can be fixed.
// ============================================================

(function diagnose() {
  console.group('%c[Brain Shadow] DeepSeek Diagnostics', 'color:#4d6bfe;font-weight:bold');

  // 1. Current URL
  console.log('Current URL:', location.href);

  // 2. All <a> hrefs on the page
  const allHrefs = [...new Set(
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
  )];
  console.log(`\n── All unique hrefs (${allHrefs.length}) ──`);
  console.log(allHrefs.join('\n'));

  // 3. localStorage keys + value previews
  console.log('\n── localStorage keys ──');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    let preview = '';
    try {
      const raw = localStorage.getItem(key);
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        preview = JSON.stringify(parsed).slice(0, 200);
      } else {
        preview = String(raw).slice(0, 100);
      }
    } catch {
      preview = localStorage.getItem(key)?.slice(0, 100) || '';
    }
    console.log(`  "${key}":`, preview);
  }

  // 4. Sidebar / nav elements with class names
  console.log('\n── Scrollable containers ──');
  const allEls = document.querySelectorAll('*');
  const scrollables = [];
  allEls.forEach(el => {
    const s = window.getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 20) {
      scrollables.push({
        tag: el.tagName,
        id: el.id || '',
        cls: el.className?.toString?.().slice(0, 80) || '',
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        children: el.children.length,
      });
    }
  });
  console.table(scrollables);

  // 5. All class names that contain "chat", "history", "session", "conv", "sidebar"
  console.log('\n── Relevant class names in DOM ──');
  const relevantClasses = new Set();
  document.querySelectorAll('[class]').forEach(el => {
    const classes = el.className?.toString?.().split(/\s+/) || [];
    classes.forEach(c => {
      if (/chat|history|session|conv|sidebar|side.?bar|thread|list.?item|item.?list/i.test(c)) {
        relevantClasses.add(c);
      }
    });
  });
  console.log([...relevantClasses].join('\n'));

  // 6. Sample of clickable sidebar-like items
  console.log('\n── Potential sidebar items (first 10) ──');
  const potentialItems = [
    ...document.querySelectorAll('[role="button"],[role="listitem"],[tabindex="0"]')
  ]
    .filter(el => {
      const t = el.innerText?.trim();
      return t && t.length > 3 && t.length < 120;
    })
    .slice(0, 10)
    .map(el => ({
      tag: el.tagName,
      cls: el.className?.toString?.().slice(0, 60),
      text: el.innerText?.trim().slice(0, 60),
      dataAttrs: Object.keys(el.dataset).join(','),
    }));
  console.table(potentialItems);

  // 7. IndexedDB database names
  console.log('\n── IndexedDB databases ──');
  if (indexedDB.databases) {
    indexedDB.databases().then(dbs => {
      console.log(dbs.map(d => d.name).join(', ') || '(none)');
    });
  } else {
    console.log('(indexedDB.databases() not supported in this browser)');
  }

  // 8. window keys that look like store / app state
  console.log('\n── Interesting window keys ──');
  const interestingKeys = Object.keys(window).filter(k =>
    /store|state|redux|zustand|chat|conv|session|deepseek|app|__next/i.test(k)
  );
  console.log(interestingKeys.join(', ') || '(none)');

  console.groupEnd();
})();
