/**
 * Brain Shadow — Universal Discovery Engine (Phase 1)
 *
 * Platform-agnostic controller that walks an AI platform's conversation
 * sidebar END-TO-END and collects EVERY conversation.
 *
 * Core idea: the sidebar DOM is only a temporary window into the full
 * conversation list. Virtualized lists (ChatGPT, Claude, Gemini, …)
 * unmount items as you scroll, so only ~20-30 exist in the DOM at any
 * instant. This engine therefore:
 *
 *   1. collects whatever is currently rendered,
 *   2. merges it into a persistent Map keyed by a stable identifier,
 *   3. scrolls one step,
 *   4. waits for newly rendered conversations,
 *   5. repeats until the ACTUAL end of the list is detected.
 *
 * End-of-list detection uses real signals only:
 *   - scroll position at the bottom of the container,
 *   - container scrollHeight stable across cycles (no lazy appends),
 *   - no NEW unique chats for N consecutive render/settle cycles,
 *   - "Show/Load more" affordances exhausted (when present).
 *
 * There is NO chat-count limit anywhere. The only termination rules are
 * the end-of-list signals above plus time/cycle-based safety valves that
 * exist purely to prevent an infinite loop on a broken page.
 *
 * The engine is dependency-injected (all DOM access goes through `hooks`)
 * so it can be unit-tested in plain Node against a simulated virtualized
 * sidebar (see test/discovery-engine.test.mjs).
 */
(function (root) {
  'use strict';

  const DEFAULTS = {
    // Consecutive cycles with (no new chats AND unchanged height AND at
    // bottom) before declaring end-of-list. Generous so slow network
    // pagination isn't cut short; NOT related to chat counts in any way.
    stableCycles: 5,

    // Cycles with zero scrolling movement, zero height change and zero new
    // chats while NOT at bottom => renderer looks frozen/throttled. The
    // engine keeps running but flags it via progress so a coordinator can
    // un-throttle (e.g. briefly activate the hidden tab).
    stallCycles: 14,

    // After this many consecutive stalled cycles, give up gracefully and
    // return everything collected so far (safety valve only).
    stallGiveUpCycles: 42,

    // Absolute wall-clock safety valve ONLY (never a chat cap): if discovery
    // somehow runs this long, stop and return what was collected.
    maxDurationMs: 10 * 60 * 1000,

    // Sustained wall-clock silence required AT THE BOTTOM before declaring
    // end-of-list. This is the anti-"~59 chats" guard: platforms preload
    // only the first history page, and the fetch for OLDER pages produces
    // zero DOM changes until it lands (often 2-5s). Cycle counters alone
    // elapsed in ~2-3s and faked exhaustion mid-fetch. Any new chat, any
    // scrollHeight growth, a load-more click or a container swap pushes
    // this deadline forward again.
    bottomQuietMs: 4000,

    // Tolerance for "at bottom" checks.
    bottomEpsilon: 4,
  };

  function normalize(chat) {
    const out = {
      key: String(chat.key || chat.url || ''),
      url: String(chat.url || ''),
      title: typeof chat.title === 'string' ? chat.title : '',
    };
    if (chat.id !== undefined && chat.id !== null && chat.id !== '') out.id = String(chat.id);
    if (chat.platform) out.platform = String(chat.platform);
    return out;
  }

  /**
   * @param {Object} hooks
   *   getContainer()      -> sidebar scrollable element (or null/body)
   *   collectVisible()    -> Array<{key,url,title,id?,platform?}> rendered RIGHT NOW
   *   getScrollInfo(el)   -> {scrollTop, clientHeight, scrollHeight, scrollable}
   *   scrollStep(el)      -> advance the container one viewport-ish step toward the end
   *   scrollToTop(el)     -> reset to the top of the list
   *   clickLoadMore(el)   -> try clicking a "show more"-style control inside el; true if clicked
   *   wait(ms)            -> Promise resolving after ms
   *   waitForSettle()     -> Promise resolving once rendering has gone quiet
   *   now()               -> timestamp ms
   * @param {Object} opts        overrides of DEFAULTS
   * @param {Function} onProgress (totalUniqueChats, extra{stalled}) called whenever count changes
   * @param {Function} shouldStop () => boolean polled every cycle
   * @returns {Promise<{chats:Array,total:number,reason:string,cycles:number}>}
   *          reason: 'end_of_list' | 'timeout' | 'stopped' | 'stalled_gave_up'
   */
  async function runDiscovery(hooks, opts, onProgress, shouldStop) {
    opts = { ...DEFAULTS, ...(opts || {}) };
    onProgress = typeof onProgress === 'function' ? onProgress : () => {};
    shouldStop = typeof shouldStop === 'function' ? shouldStop : () => false;

    const now = () => (typeof hooks.now === 'function' ? hooks.now() : Date.now());

    // ── Persistent collection: the memory that survives virtualization ──
    const seen = new Map(); // stable key -> normalized chat

    let addedLast = 0;

    const harvest = () => {
      let batch;
      try { batch = hooks.collectVisible() || []; } catch { batch = []; }
      let added = 0;
      for (const raw of batch) {
        if (!raw || !raw.key || !raw.url) continue;
        const existing = seen.get(raw.key);
        if (!existing) {
          seen.set(raw.key, normalize(raw));
          added++;
        } else if ((!existing.title || existing.title === existing.url) &&
                   raw.title && raw.title !== raw.url && raw.title !== existing.title) {
          existing.title = raw.title; // enrich with a better label seen later
        }
      }
      return added;
    };

    const report = (extra) => onProgress(seen.size, extra);

    const safe = async (fn, fallback) => {
      try { return await fn(); } catch { return fallback; }
    };

    // ── Initial state ────────────────────────────────────────────────────
    const t0 = now();

    let cycles = 0;
    let stagnantCycles = 0;       // consecutive cycles that found nothing NEW
    let heightStableCycles = 0;   // consecutive cycles with identical scrollHeight
    let stallCounter = 0;         // consecutive fully-frozen cycles (not at bottom)
    let holdEndCycles = 0;        // grace period after a successful load-more click
    let lastHeight = null;
    let lastScrollTop = null;
    let lastReportStalled = false;
    let lastActivityAt = t0;      // last sign of life: new chats / growth / click / swap

    // Scroll-target management. The host supplies a RANKED LIST of scroll
    // container candidates; the engine drives the current one, VERIFIES it
    // physically moved, and rotates to the next candidate whenever one has
    // room to scroll but refuses to move (inert wrapper / wrong nesting).
    // This removes the single-point-of-failure that capped field discovery
    // at the first preloaded window (~30/~59 chats).
    let container = null;
    let candIdx = 0;
    let containerSwitches = 0;
    let latestCands = [];

    const resetPatience = () => {
      stagnantCycles = 0;
      heightStableCycles = 0;
      stallCounter = 0;
      lastHeight = null;
      lastScrollTop = null;
      lastActivityAt = now();
    };

    const refreshCandidates = async () => {
      let cands = await safe(async () =>
        (hooks.getContainers ? hooks.getContainers() : null), null);
      if ((!cands || !cands.length) && hooks.getContainer) {
        const single = await safe(async () => hooks.getContainer(), null);
        cands = single ? [single] : [];
      }
      latestCands = (cands || []).filter(Boolean);
      if (!latestCands.length) return;
      const curIdx = container ? latestCands.indexOf(container) : -1;
      if (curIdx === -1) {
        const prev = container;
        candIdx = Math.min(candIdx, latestCands.length - 1);
        container = latestCands[candIdx];
        // First acquisition is not a "switch"; only re-targets count.
        if (prev) {
          containerSwitches++;
          resetPatience();
        }
      } else {
        candIdx = curIdx;
      }
    };

    await refreshCandidates();

    await safe(() => hooks.scrollToTop && hooks.scrollToTop(container));
    await safe(() => hooks.waitForSettle ? hooks.waitForSettle() : hooks.wait(300));

    harvest();
    if (addedLast !== seen.size) { addedLast = seen.size; report({ stalled: false }); }

    // ── Main walk loop ───────────────────────────────────────────────────
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (shouldStop()) return finish('stopped');
      if (now() - t0 > opts.maxDurationMs) return finish('timeout');

      cycles++;

      // 0) Re-resolve the live scroller candidates (SPAs hydrate late,
      //    re-mount list nodes). Identity changes restart patience — the
      //    old node's stillness says nothing about the new one.
      await refreshCandidates();

      // 1) Platform-specific pagination affordances ("Show more", …),
      //    strictly scoped to the sidebar container.
      const clickedMore = await safe(async () =>
        !!(hooks.clickLoadMore && hooks.clickLoadMore(container)), false);
      if (clickedMore) {
        holdEndCycles = opts.stableCycles + 2; // give freshly loaded rows time to appear
        lastActivityAt = now();
        await safe(() => hooks.waitForSettle ? hooks.waitForSettle() : hooks.wait(300));
      }

      // 2) Advance one step toward the end of the list — then VERIFY the
      //    target physically moved. A candidate with room to scroll that
      //    didn't move is inert or wrong; rotate to the next ranked
      //    candidate immediately and drive it instead.
      const beforeInfo = await safe(async () =>
        (hooks.getScrollInfo ? hooks.getScrollInfo(container) : null), null);
      await safe(() => hooks.scrollStep && hooks.scrollStep(container));
      const afterInfo = await safe(async () =>
        (hooks.getScrollInfo ? hooks.getScrollInfo(container) : null), null);

      const couldMove = !!beforeInfo &&
        (beforeInfo.scrollHeight - beforeInfo.clientHeight - beforeInfo.scrollTop) > opts.bottomEpsilon;
      const didMove = !!beforeInfo && !!afterInfo &&
        afterInfo.scrollTop !== beforeInfo.scrollTop;

      if (couldMove && !didMove && latestCands.length > 1) {
        candIdx = (candIdx + 1) % latestCands.length;
        const alt = latestCands[candIdx];
        if (alt && alt !== container) {
          container = alt;
          containerSwitches++;
          resetPatience();
          await safe(() => hooks.scrollStep && hooks.scrollStep(container));
        }
      }

      // 3) Let the virtualizer/network render the new window.
      await safe(() => hooks.waitForSettle ? hooks.waitForSettle() : hooks.wait(300));

      // 4) Harvest whatever is rendered NOW into the persistent map.
      const added = harvest();

      // 5) Read scroll signals.
      const info = await safe(async () =>
        (hooks.getScrollInfo ? hooks.getScrollInfo(container) : null), null) ||
        { scrollTop: 0, clientHeight: 0, scrollHeight: 0, scrollable: false };

      const atBottom = !info.scrollable ||
        info.scrollTop + info.clientHeight >= info.scrollHeight - opts.bottomEpsilon;

      // New content found → clearly not the end yet.
      if (added > 0) stagnantCycles = 0; else stagnantCycles++;
      if (added !== 0 || seen.size !== addedLast) { addedLast = seen.size; }

      // List height changing ⇒ older pages are still being appended.
      if (lastHeight !== null && info.scrollHeight === lastHeight) heightStableCycles++;
      else heightStableCycles = 0;

      // Frozen-renderer detection (throttling, broken virtualizer…).
      const moved = lastScrollTop !== null && info.scrollTop !== lastScrollTop;
      const grew  = lastHeight   !== null && info.scrollHeight !== lastHeight;

      // Any sign of life pushes the end-of-list quiet deadline forward —
      // an in-flight older-page fetch emits NOTHING until it lands, so
      // silence alone (for a few fast cycles) must never mean "finished".
      if (added > 0 || grew) lastActivityAt = now();

      if (!moved && !grew && added === 0 && !atBottom) stallCounter++;
      else stallCounter = 0;
      const stalledNow = stallCounter >= opts.stallCycles;
      if (stalledNow !== lastReportStalled || added > 0) {
        lastReportStalled = stalledNow;
        report({ stalled: stalledNow });
      } else if (added > 0) {
        report({ stalled: stalledNow });
      }
      if (holdEndCycles > 0) holdEndCycles--;

      // 6) End-of-list decision — real signals only, NEVER a count limit.
      //    The quiet-window gate is the authoritative one: history is only
      //    "exhausted" after bottomQuietMs of TOTAL silence (no new chats,
      //    no growth, no clicks, no container change) while parked at the
      //    bottom. Cycle counters alone fired in ~2-3s — mid-fetch.
      const endReached =
        atBottom &&
        holdEndCycles <= 0 &&
        stagnantCycles >= opts.stableCycles &&
        heightStableCycles >= opts.stableCycles &&
        (now() - lastActivityAt) >= opts.bottomQuietMs;

      if (endReached) return finish('end_of_list');
      if (stallCounter >= opts.stallGiveUpCycles) return finish('stalled_gave_up');

      // 7) Per-cycle telemetry for the host (debug logging requirement:
      //    which element scrolled, positions, and whether new chats appeared).
      if (typeof hooks.onCycle === 'function') {
        await safe(() => hooks.onCycle({
          el: container,
          cycle: cycles,
          scrollTop: info.scrollTop,
          clientHeight: info.clientHeight,
          scrollHeight: info.scrollHeight,
          scrollable: info.scrollable,
          atBottom,
          addedThisCycle: added,
          uniqueTotal: seen.size,
          stagnantCycles,
          heightStableCycles,
          stallCounter,
          containerSwitches,
          candidates: latestCands.length,
          stalled: stalledNow,
          msSinceActivity: now() - lastActivityAt,
        }));
      }

      lastHeight = info.scrollHeight;
      lastScrollTop = info.scrollTop;
    }

    function finish(reason) {
      return {
        chats: [...seen.values()],
        total: seen.size,
        reason,
        cycles,
        stats: { containerSwitches, stagnantCycles, heightStableCycles, stallCounter, msSinceActivity: now() - lastActivityAt },
      };
    }
  }

  const api = { runDiscovery, DEFAULTS };

  // Content-script global namespace (shared scope across extension files).
  root.BrainShadow = root.BrainShadow || {};
  root.BrainShadow.DiscoveryEngine = api;

  // CommonJS export so plain Node tests can require() this file.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
