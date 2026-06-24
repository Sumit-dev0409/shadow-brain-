// ============================================================
// Brain Shadow — GitHub Copilot Diagnostics
// Paste this in DevTools Console on github.com/copilot
// Share the full output so the extractor can be fixed.
// ============================================================

(function diagnose() {
  console.group('%c[Brain Shadow] Copilot Diagnostics', 'color:#8957e5;font-weight:bold');

  // 1. Current URL
  console.log('Current URL:', location.href);

  // 2. ALL unique hrefs on the page
  const allHrefs = [...new Set(
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
  )];
  console.log(`\n── All unique hrefs (${allHrefs.length}) ──`);
  console.log(allHrefs.join('\n'));

  // 3. hrefs that contain "copilot"
  const copilotHrefs = allHrefs.filter(h => h.includes('copilot'));
  console.log(`\n── hrefs containing "copilot" (${copilotHrefs.length}) ──`);
  console.log(copilotHrefs.join('\n') || '(none)');

  // 4. Scrollable containers
  console.log('\n── Scrollable containers ──');
  const scrollables = [];
  document.querySelectorAll('*').forEach(el => {
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

  // 5. Relevant class names
  console.log('\n── Relevant class names (chat|thread|conv|sidebar|history) ──');
  const relevantClasses = new Set();
  document.querySelectorAll('[class]').forEach(el => {
    el.className?.toString?.().split(/\s+/).forEach(c => {
      if (/chat|thread|conv|sidebar|history|panel|list.?item|item.?list/i.test(c))
        relevantClasses.add(c);
    });
  });
  console.log([...relevantClasses].join('\n') || '(none)');

  // 6. data-testid attributes in the page
  console.log('\n── data-testid values ──');
  const testIds = [...new Set(
    [...document.querySelectorAll('[data-testid]')].map(el => el.getAttribute('data-testid'))
  )];
  console.log(testIds.join('\n') || '(none)');

  // 7. Clickable items that might be conversation entries
  console.log('\n── Potential sidebar items (first 15) ──');
  const items = [...document.querySelectorAll('[role="button"],[role="listitem"],[role="option"],[tabindex="0"]')]
    .filter(el => { const t = el.innerText?.trim(); return t && t.length > 3 && t.length < 150; })
    .slice(0, 15)
    .map(el => ({
      tag: el.tagName,
      role: el.getAttribute('role') || '',
      cls: el.className?.toString?.().slice(0, 60),
      text: el.innerText?.trim().slice(0, 60),
      dataTestId: el.dataset.testid || '',
    }));
  console.table(items);

  console.groupEnd();
})();
