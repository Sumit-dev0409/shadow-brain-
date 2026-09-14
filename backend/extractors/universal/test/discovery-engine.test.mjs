/**
 * Discovery Engine unit tests — simulated virtualized sidebars.
 *
 * Validates the two-phase requirement: discover ALL chats (no fixed limit)
 * before scraping, across the scenarios that broke the old implementation:
 *
 *   A. 200 chats in a CONSTANT-HEIGHT virtualized list (the ChatGPT case
 *      that previously yielded ~29-30).
 *   B. Small account (15 chats, no scrollbar) — quick clean exit.
 *   C. Lazy-append pagination (older pages fetched as you near bottom).
 *   D. Overlapping render windows — same chat rendered repeatedly must be
 *      counted exactly once (dedupe by stable key).
 *   E. "Show more"-style pagination platform behavior.
 *   F. Frozen/throttled renderer — bounded exit, no infinite loop.
 *   G. Stop request honored mid-discovery.
 *   H. Normalized chat object contract ({key,id,url,title,platform}).
 *
 * Run: node backend/extractors/universal/test/discovery-engine.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { runDiscovery } = require('../discovery-engine.js');

// ── Simulated sidebar ────────────────────────────────────────
function makeSidebar({
  total = 200,
  windowSize = 30,
  overlap = 0,
  itemH = 40,
  viewport = 400,
  lazyPageSize = 0,        // >0 => older pages append as you approach bottom
  loadMoreBatch = 0,       // >0 => "Show more" button pagination
  freezeAfterScrolls = null, // simulate throttled/frozen renderer
}) {
  const st = {
    scrollTop: 0,
    loaded: lazyPageSize ? Math.min(lazyPageSize, total) : total,
    domCount: loadMoreBatch ? Math.min(8, total) : total,
    scrolls: 0,
    clicks: 0,
  };
  // STABLE container node across cycles (the engine re-resolves each cycle
  // and treats an identity change as "list context changed").
  const containerNode = { tag: 'sidebar-scroller' };
  const vc = { t: 0 };

  const info = () => {
    const scrollHeight = (lazyPageSize ? st.loaded : st.domCount) * itemH;
    return {
      scrollTop: st.scrollTop,
      clientHeight: viewport,
      scrollHeight,
      scrollable: scrollHeight > viewport + 8,
    };
  };

  const hooks = {
    getContainer: () => containerNode,
    getScrollInfo: () => info(),
    scrollToTop: () => { st.scrollTop = 0; },
    scrollStep: (el) => {
      if (freezeAfterScrolls !== null && st.scrolls >= freezeAfterScrolls) return; // renderer frozen
      st.scrolls++;
      // Virtualized lists don't grow scrollHeight as you scroll — the
      // height is fixed for the whole (loaded) range; only the rendered
      // window moves. This is exactly what defeated the old code.
      const i = info();
      const step = Math.min(800, Math.max(240, Math.floor(viewport * 0.8)));
      st.scrollTop = Math.min(st.scrollTop + step, Math.max(0, i.scrollHeight - viewport));
      if (lazyPageSize && st.loaded < total &&
          st.scrollTop + viewport >= st.loaded * itemH - viewport * 0.5) {
        st.loaded = Math.min(total, st.loaded + lazyPageSize);
      }
    },
    collectVisible: () => {
      if (loadMoreBatch) {
        return Array.from({ length: st.domCount }, (_, idx) => ({
          key: `chatgpt:${idx}`, id: String(idx),
          url: `https://chatgpt.com/c/id-${idx}`,
          title: `Chat ${idx}`, platform: 'chatgpt',
        }));
      }
      const start = Math.max(0, Math.floor(st.scrollTop / itemH) - overlap);
      const end = Math.min(lazyPageSize ? st.loaded : total, start + windowSize);
      return Array.from({ length: Math.max(0, end - start) }, (_, k) => {
        const idx = start + k;
        return {
          key: `chatgpt:${idx}`, id: String(idx),
          url: `https://chatgpt.com/c/id-${idx}`,
          title: `Chat ${idx}`, platform: 'chatgpt',
        };
      });
    },
    clickLoadMore: () => {
      if (!loadMoreBatch) return false;
      if (st.domCount >= total) return false;
      st.clicks++;
      st.domCount = Math.min(total, st.domCount + loadMoreBatch);
      return true;
    },
    wait: async () => {},
    // Virtual clock: each settle advances time so the engine's
    // wall-clock quiet-window gate can be exercised deterministically.
    waitForSettle: async () => { vc.t += 500; },
    now: () => vc.t,
  };
  return { hooks, st, containerNode };
}

test('A: 200 chats in constant-height virtualized sidebar — discovers ALL 200', async () => {
  const { hooks } = makeSidebar({ total: 200, windowSize: 30 });
  const seenTotals = [];
  const res = await runDiscovery(hooks, {}, (t) => seenTotals.push(t), () => false);
  assert.equal(res.total, 200, `expected 200, got ${res.total}`);
  assert.equal(res.chats.length, 200);
  assert.equal(res.reason, 'end_of_list');
  const keys = new Set(res.chats.map(c => c.key));
  assert.equal(keys.size, 200);
});

test('A2: 500 chats — no artificial ceiling', async () => {
  const { hooks } = makeSidebar({ total: 500, windowSize: 25, overlap: 4 });
  const res = await runDiscovery(hooks, {}, () => {}, () => false);
  assert.equal(res.total, 500);
  assert.equal(res.reason, 'end_of_list');
});

test('B: 15-chat account (no scrollbar) — discovers 15 and exits cleanly', async () => {
  const { hooks } = makeSidebar({ total: 15, windowSize: 30 });
  const res = await runDiscovery(hooks, {}, () => {}, () => false);
  assert.equal(res.total, 15);
  assert.equal(res.reason, 'end_of_list');
});

test('B2: 29-chat account must not round or cap', async () => {
  const { hooks } = makeSidebar({ total: 29, windowSize: 12 });
  const res = await runDiscovery(hooks, {}, () => {}, () => false);
  assert.equal(res.total, 29);
});

test('C: lazy-append pagination (pages of 50 up to 200) — discovers 200', async () => {
  const { hooks } = makeSidebar({ total: 200, windowSize: 30, lazyPageSize: 50 });
  const res = await runDiscovery(hooks, {}, () => {}, () => false);
  assert.equal(res.total, 200, `got ${res.total}`);
  assert.equal(res.reason, 'end_of_list');
});

test('D: heavily overlapping render windows — strict dedupe', async () => {
  const { hooks } = makeSidebar({ total: 150, windowSize: 30, overlap: 12 });
  const res = await runDiscovery(hooks, {}, () => {}, () => false);
  const keys = new Set(res.chats.map(c => c.key));
  assert.equal(keys.size, 150, 'same conversation must never be counted twice');
  assert.equal(res.total, 150);
});

test('E: "Show more" pagination platform — collects every batch', async () => {
  const { hooks } = makeSidebar({ total: 108, loadMoreBatch: 25 });
  const res = await runDiscovery(hooks, {}, () => {}, () => false);
  assert.equal(res.total, 108, `got ${res.total}`);
  assert.ok(res.reason === 'end_of_list' || res.reason === 'timeout');
});

test('F: frozen renderer mid-list — bounded graceful exit, no hang', async () => {
  const { hooks } = makeSidebar({ total: 300, windowSize: 20, freezeAfterScrolls: 5 });
  const started = Date.now();
  const res = await runDiscovery(hooks, { stallGiveUpCycles: 20 }, () => {}, () => false);
  assert.ok(Date.now() - started < 5000, 'must not hang forever');
  assert.ok(res.total > 0 && res.total < 300, 'returns partial collection');
  assert.equal(res.reason, 'stalled_gave_up');
});

test('G: stop request honored immediately', async () => {
  const { hooks } = makeSidebar({ total: 200, windowSize: 10 });
  let stopped = false;
  const res = await runDiscovery(hooks, {}, () => { stopped = true; }, () => stopped);
  assert.equal(res.reason, 'stopped');
  assert.ok(res.total < 200);
});

test('H: normalized chat object contract', async () => {
  const { hooks } = makeSidebar({ total: 5, windowSize: 10 });
  const res = await runDiscovery(hooks, {}, () => {}, () => false);
  for (const c of res.chats) {
    assert.ok(c.key && c.url && typeof c.title === 'string' && c.platform === 'chatgpt');
    assert.equal(c.id, c.key.split(':')[1]);
  }
});

test('I: container swapped mid-run (late hydration) — recovers and discovers ALL', async () => {
  // Reproduces the field bug exactly: discovery locks onto an inert node
  // (sidebar not hydrated yet), then the real scroller appears later.
  const total = 120;
  const itemH = 40, viewport = 400;
  const st2 = { scrollTop: 0, loaded: total };
  const vcI = { t: 0 };
  const inert = { tag: 'inert-body' };     // scrolling this does NOTHING
  const live  = { tag: 'real-scroller' };
  let calls = 0;

  const info = () => ({
    scrollTop: st2.scrollTop,
    clientHeight: viewport,
    scrollHeight: total * itemH,
    scrollable: true,
  });

  const hooks = {
    getContainer: () => (calls++ < 3 ? inert : live), // swap after 3 cycles
    getScrollInfo: () => info(),
    scrollToTop: () => { st2.scrollTop = 0; },
    scrollStep: (el) => {
      if (el === inert) return; // inert node: scrollTop never moves
      st2.scrollTop = Math.min(st2.scrollTop + 320, total * itemH - viewport);
    },
    collectVisible: () => {
      const start = Math.max(0, Math.floor(st2.scrollTop / itemH));
      return Array.from({ length: Math.min(30, total - start) }, (_, k) => ({
        key: `chatgpt:${start + k}`, id: String(start + k),
        url: `https://chatgpt.com/c/id-${start + k}`,
        title: `Chat ${start + k}`, platform: 'chatgpt',
      }));
    },
    clickLoadMore: () => false,
    wait: async () => {},
    waitForSettle: async () => { vcI.t += 500; },
    now: () => vcI.t,
  };

  const res = await runDiscovery(hooks, {}, () => {}, () => false);
  assert.equal(res.total, total, `expected full ${total} after container swap, got ${res.total}`);
  assert.equal(res.reason, 'end_of_list');
  assert.equal(res.stats.containerSwitches, 1);
});

test('K: per-cycle telemetry hook fires with required debug fields', async () => {
  const { hooks } = makeSidebar({ total: 60, windowSize: 20 });
  const cycles = [];
  await runDiscovery(
    { ...hooks, onCycle: (d) => cycles.push(d) },
    {}, () => {}, () => false
  );
  assert.ok(cycles.length > 0);
  for (const d of cycles) {
    for (const k of ['el', 'cycle', 'scrollTop', 'scrollHeight', 'clientHeight',
                     'atBottom', 'addedThisCycle', 'uniqueTotal']) {
      assert.ok(k in d, `telemetry missing ${k}`);
    }
  }
});

test('L: REGRESSION — preloaded page (~59) + slower-than-patience pagination must reach ALL', async () => {
  // Reproduces the field failure exactly:
  //   - platform PRELOADS only the first 59 chats server-side,
  //   - older pages arrive every 6 settles (3.0s virtual) — SLOWER than the
  //     old end condition's 5-fast-cycle (~2.5s) patience, which declared
  //     end_of_list mid-fetch and froze discovery at exactly ~59.
  const total = 121, itemH = 40, viewport = 400;
  const stL = { scrollTop: 0, loaded: 59 };
  const vcL = { t: 0 };
  const node = { tag: 'scroller' };
  let settles = 0;

  const hooksL = {
    getContainer: () => node,
    getScrollInfo: () => ({
      scrollTop: stL.scrollTop,
      clientHeight: viewport,
      scrollHeight: stL.loaded * itemH,
      scrollable: stL.loaded * itemH > viewport + 8,
    }),
    scrollToTop: () => { stL.scrollTop = 0; },
    scrollStep: () => {
      stL.scrollTop = Math.min(stL.scrollTop + 320, Math.max(0, stL.loaded * itemH - viewport));
    },
    collectVisible: () => {
      const start = Math.max(0, Math.floor(stL.scrollTop / itemH));
      const end = Math.min(stL.loaded, start + 30);
      return Array.from({ length: Math.max(0, end - start) }, (_, k) => {
        const idx = start + k;
        return { key: `chatgpt:${idx}`, id: String(idx),
                 url: `https://chatgpt.com/c/id-${idx}`,
                 title: `Chat ${idx}`, platform: 'chatgpt' };
      });
    },
    clickLoadMore: () => false,
    wait: async () => {},
    waitForSettle: async () => {
      vcL.t += 500; settles++;
      if (settles % 6 === 0 && stL.loaded < total) stL.loaded += 31; // slow older-page fetch
    },
    now: () => vcL.t,
  };

  const res = await runDiscovery(hooksL, {}, () => {}, () => false);
  assert.equal(res.total, total, `expected ALL ${total}, stopped early at ${res.total}`);
  assert.equal(res.reason, 'end_of_list');
});

test('M: quiet-window is measured in TIME, not cycles — fast settles wait it out', async () => {
  // Tiny account: everything visible immediately, but settle ticks are
  // deliberately FAST relative to bottomQuietMs — end must still come from
  // sustained silence (reason end_of_list), never from cycle counting alone.
  const total = 5, itemH = 40, viewport = 400;
  const vcM = { t: 0 };
  const node = { tag: 'static' };
  const hooksM = {
    getContainer: () => node,
    getScrollInfo: () => ({ scrollTop: 0, clientHeight: viewport, scrollHeight: total * itemH, scrollable: false }),
    scrollToTop: () => {},
    scrollStep: () => {},
    collectVisible: () => Array.from({ length: total }, (_, i) => ({
      key: `p:${i}`, id: String(i), url: `https://x/c/${i}`, title: `Chat ${i}`, platform: 'perplexity',
    })),
    clickLoadMore: () => false,
    wait: async () => {},
    waitForSettle: async () => { vcM.t += 100; }, // fast ticks
    now: () => vcM.t,
  };
  const res = await runDiscovery(hooksM, {}, () => {}, () => false);
  assert.equal(res.total, 5);
  assert.equal(res.reason, 'end_of_list');
  assert.ok(res.stats.msSinceActivity >= 4000 - 1e-6 || res.stats.stagnantCycles >= 5);
});

test('N: inert top-ranked candidate — engine rotates to the live scroller and finds ALL', async () => {
  // Field failure mode: container scoring locks onto an inert wrapper that
  // HAS room to scroll but never moves. The engine must detect "could move
  // but didn't", rotate down the ranked candidate list, and drive the real
  // scroller instead of declaring end-of-list at the preloaded window.
  const total = 121, itemH = 40, viewport = 400;
  const stN = { scrollTop: 0, loaded: 59 };   // preloaded first page
  const vcN = { t: 0 };
  const inertA = { tag: 'inert-wrapper' };
  const realB  = { tag: 'real-scroller' };
  let settles = 0;

  const infoFor = (el) => el === inertA
    ? { scrollTop: 120, clientHeight: viewport, scrollHeight: 5000, scrollable: true } // frozen mid-list
    : { scrollTop: stN.scrollTop, clientHeight: viewport,
        scrollHeight: stN.loaded * itemH, scrollable: stN.loaded * itemH > viewport + 8 };

  const hooksN = {
    getContainers: () => [inertA, realB],
    getContainer: () => inertA, // legacy single hook must not be consulted
    getScrollInfo: (el) => infoFor(el),
    scrollToTop: (el) => { if (el === realB) stN.scrollTop = 0; },
    scrollStep: (el) => {
      if (el !== realB) return; // inert wrapper ignores scroll writes
      stN.scrollTop = Math.min(stN.scrollTop + 320, Math.max(0, stN.loaded * itemH - viewport));
    },
    collectVisible: () => {
      // Only the REAL scroller's window yields rows.
      const start = Math.max(0, Math.floor(stN.scrollTop / itemH));
      const end = Math.min(stN.loaded, start + 30);
      return Array.from({ length: Math.max(0, end - start) }, (_, k) => {
        const idx = start + k;
        return { key: `grok:${idx}`, id: String(idx),
                 url: `https://x.com/i/grok?conversation=${idx}`,
                 title: `Chat ${idx}`, platform: 'grok' };
      });
    },
    clickLoadMore: () => false,
    wait: async () => {},
    waitForSettle: async () => {
      vcN.t += 500; settles++;
      if (settles % 2 === 0 && stN.loaded < total) stN.loaded += 31;
    },
    now: () => vcN.t,
  };

  const res = await runDiscovery(hooksN, {}, () => {}, () => false);
  assert.equal(res.total, total, `expected ALL ${total}, got ${res.total}`);
  assert.equal(res.reason, 'end_of_list');
  assert.ok(res.stats.containerSwitches >= 1, 'expected at least one candidate rotation');
});
