/*
 * health.mjs — checks that need the network or the page's own timeline, not the DOM.
 *
 * Two blind spots that no amount of DOM inspection closes:
 *   1. Whether a link actually resolves. A perfectly-formed href to a page that was
 *      renamed six weeks ago looks identical to a working one in the DOM. "404s on
 *      these URLs" is a standing item on every real QA list, and it can only be
 *      answered by asking the server.
 *   2. What the page did while it was loading. Cards that snap into place, a slider
 *      that jumps on first paint, content that shoves everything down when a font
 *      swaps — all invisible once the page has settled, which is exactly when a
 *      static audit looks at it.
 */

/* ── LINK CHECK ────────────────────────────────────────────────────────────────
 * Resolve every unique internal link (and optionally external ones) and report
 * anything that doesn't return 2xx/3xx. Runs inside the page's own request context
 * so cookies, auth and relative paths all behave exactly as they do for a visitor.
 */
export async function linkCheck(page, { includeExternal = false, max = 120, concurrency = 6 } = {}) {
  const links = await page.evaluate(({ inc }) => {
    const here = location.origin;
    const seen = new Map();
    document.querySelectorAll('a[href]').forEach(a => {
      const raw = a.getAttribute('href');
      if (!raw || /^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) return;
      let u; try { u = new URL(raw, location.href); } catch (e) { return; }
      if (!/^https?:$/.test(u.protocol)) return;
      const external = u.origin !== here;
      if (external && !inc) return;
      const key = u.href.split('#')[0];
      if (!seen.has(key)) seen.set(key, { url: key, external,
        text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) });
    });
    return [...seen.values()];
  }, { inc: includeExternal });

  const targets = links.slice(0, max);
  const results = [];
  // fetch from inside the page: same origin rules, same cookies, no CORS surprises
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const batchRes = await page.evaluate(async (items) => Promise.all(items.map(async it => {
      try {
        // HEAD first (cheap); some servers reject it, so fall back to a ranged GET
        let r = await fetch(it.url, { method: 'HEAD', redirect: 'follow' });
        if (r.status === 405 || r.status === 501)
          r = await fetch(it.url, { method: 'GET', redirect: 'follow', headers: { Range: 'bytes=0-0' } });
        return { ...it, status: r.status, finalUrl: r.url !== it.url ? r.url : undefined };
      } catch (e) { return { ...it, status: 0, error: String(e.message || e).slice(0, 50) }; }
    })), batch);
    results.push(...batchRes);
  }

  const broken = results.filter(r => r.status >= 400 || r.status === 0)
    .map(r => ({ url: r.url, status: r.status || 'network error', text: r.text, error: r.error }));

  /* ── CLUSTER THE BREAKAGE, THEN GO LOOK AT THE PARENT ─────────────────────────
   * Four 404s under /insights/ is not four findings, it is one: either the collection's
   * slug field disagrees with what the cards link to, or the items are still drafts. Listing
   * them individually buries that and invites four separate tickets, none of which is the fix.
   *
   * So: group by the first path segment, and when a group has 2+ failures, fetch the parent
   * listing (/insights/) and report whether it resolves and whether it links to the same dead
   * URLs. That single extra request distinguishes the two root causes:
   *   - parent 200 and links to the same dead URLs → the slugs are wrong, or the items are unpublished
   *   - parent 200 and links elsewhere            → the cards are built from stale/hard-coded hrefs
   *   - parent 404 too                            → the whole section was never published */
  const clusters = [];
  const byPrefix = new Map();
  for (const b of broken) {
    let seg;
    try { seg = new URL(b.url).pathname.split('/').filter(Boolean)[0]; } catch { continue; }
    if (!seg) continue;
    if (!byPrefix.has(seg)) byPrefix.set(seg, []);
    byPrefix.get(seg).push(b);
  }
  for (const [seg, members] of byPrefix) {
    if (members.length < 2) continue;
    const origin = new URL(members[0].url).origin;
    const parentUrl = `${origin}/${seg}`;
    const cluster = { pathPrefix: `/${seg}/`, brokenCount: members.length,
      urls: members.map(m => m.url), parentListing: parentUrl };
    try {
      const pr = await fetch(parentUrl, { redirect: 'follow' });
      cluster.parentStatus = pr.status;
      if (pr.ok) {
        const html = await pr.text();
        const deadPaths = members.map(m => { try { return new URL(m.url).pathname; } catch { return null; } }).filter(Boolean);
        const stillLinked = deadPaths.filter(p => html.includes(p));
        cluster.parentLinksToSameDeadUrls = stillLinked.length;
        cluster.rootCause = stillLinked.length
          ? `the listing at ${parentUrl} resolves and still links to ${stillLinked.length} of these dead URLs — ` +
            'the item slugs don\'t match the links, or the items are unpublished/draft. ONE fix, not ' +
            members.length + ' tickets.'
          : `the listing at ${parentUrl} resolves but does NOT link to these URLs — the cards are ` +
            'built from stale or hard-coded hrefs rather than the collection\'s slug field.';
      } else {
        cluster.rootCause = `the listing at ${parentUrl} is itself ${pr.status} — the whole ` +
          `/${seg}/ section looks unpublished, which explains every child 404.`;
      }
    } catch (e) { cluster.parentStatus = 'network error'; cluster.error = String(e.message || e).slice(0, 50); }
    clusters.push(cluster);
  }

  return {
    checked: results.length, totalFound: links.length,
    truncated: links.length > max ? links.length - max : 0,
    broken,
    // the same failures grouped by path prefix, each with its parent listing checked
    brokenClusters: clusters,
    // a link that redirects isn't broken, but a whole site of them is a redirect
    // chain nobody meant to ship — worth seeing, not worth failing on
    redirected: results.filter(r => r.finalUrl).map(r => ({ from: r.url, to: r.finalUrl })).slice(0, 15)
  };
}

/* ── ENGINE CAPABILITY PROBES ──────────────────────────────────────────────────
 * Synthetic micro-layouts whose measured result differs between engines, plus the
 * format/API support flags that gate real features.
 *
 * The point isn't the numbers, it's that these turn "Safari might break this" into
 * a value you can diff. Each probe reproduces a known WebKit/Chromium divergence in
 * a few lines of throwaway DOM, so running the suite in both engines tells you
 * which classes of bug this build of Safari actually still has — instead of
 * guessing from a support table that's out of date the week it's published.
 *
 * Honesty about the limits, which matters more than the probes themselves:
 * Playwright's `webkit` is WebKit trunk on a non-Apple port. Layout probes track
 * real Safari reasonably well; codec/format support does NOT (different decoders),
 * and it has no iOS media policy, no Low Power Mode and no virtual keyboard. A
 * green result here is evidence about the engine, never about an iPhone.
 */
export async function engineProbes(page) {
  return page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const box = (css, parentCss) => { const p = document.createElement('div');
      p.style.cssText = 'position:absolute;left:-9999px;top:0;' + (parentCss || '');
      const c = document.createElement('div'); c.style.cssText = css;
      p.appendChild(c); document.body.appendChild(p);
      const r = c.getBoundingClientRect(); p.remove();
      return { w: Math.round(r.width), h: Math.round(r.height) }; };
    const vprobe = h => { const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:-9999px;width:1px;height:${h}`;
      document.body.appendChild(d); const v = Math.round(d.getBoundingClientRect().height); d.remove(); return v; };

    // SCROLL ANCHORING. Chromium has held scroll position since 2017 when content
    // above the viewport grows; WebKit only ships it in Safari 27. This is why a
    // Safari reader gets thrown down the page when a lazy image or embed above them
    // finally loads — the highest-frequency Safari-only scroll bug on content sites,
    // and one of the few of its kind that reproduces faithfully in a headless engine.
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;left:-9999px;width:200px;height:200px;overflow-y:scroll';
    const above = document.createElement('div'); above.style.height = '400px';
    const anchor = document.createElement('div'); anchor.style.height = '50px'; anchor.textContent = 'a';
    const below = document.createElement('div'); below.style.height = '400px';
    host.append(above, anchor, below); document.body.appendChild(host);
    host.scrollTop = 450; await frame();
    const beforeTop = anchor.getBoundingClientRect().top;
    above.style.height = '700px'; await frame();
    const shiftPx = Math.round(Math.abs(anchor.getBoundingClientRect().top - beforeTop));
    host.remove();

    // SCROLL SNAP vs PROGRAMMATIC SCROLL. The spec permits either behaviour, so the
    // engines genuinely differ: a Next button that moves the track by less than one
    // card lands snapped in Chromium and stranded mid-card in WebKit.
    const sn = document.createElement('div');
    sn.style.cssText = 'position:fixed;left:-9999px;width:100px;height:100px;overflow-x:scroll;' +
      'scroll-snap-type:x mandatory;display:flex';
    for (let i = 0; i < 5; i++) { const c = document.createElement('div');
      c.style.cssText = 'flex:0 0 100px;height:100px;scroll-snap-align:start'; sn.appendChild(c); }
    document.body.appendChild(sn);
    sn.scrollBy(30, 0); const viaScrollBy = sn.scrollLeft;
    sn.scrollLeft = 130; const viaScrollLeft = sn.scrollLeft;
    sn.remove();

    // aspect-ratio on a flex child that also sets overflow. Broken (h→0) in
    // Safari 15.4–26.3; correct in Chromium and Safari 26.4+.
    const arOverflow = box('flex:1;aspect-ratio:1;overflow:hidden', 'display:flex;width:200px');
    // aspect-ratio resolved against a percentage max-height on a flex item.
    const arMaxHeight = box('width:100%;max-height:100%;aspect-ratio:1', 'display:flex;width:300px;height:100px');

    // CONTAINING BLOCK from filter / backdrop-filter. Per spec a filtered ancestor
    // becomes the containing block for `position: fixed` descendants. The trap is
    // the *prefixed* property: `-webkit-backdrop-filter` is a live alias in WebKit
    // and triggers the full side effects, while Chromium doesn't parse it at all.
    // So a frosted nav authored with only the prefixed property traps its own
    // mega-menu or modal inside the bar in Safari and works fine in Chrome — a
    // measured 200px vs 0px divergence, and common in Webflow output.
    const cbProbe = css => {
      const w = document.createElement('div');
      w.style.cssText = 'position:absolute;left:-9999px;top:200px;height:100px;width:100px;' + css;
      const f = document.createElement('div');
      f.style.cssText = 'position:fixed;top:0;left:0;width:10px;height:10px';
      w.appendChild(f); document.body.appendChild(w);
      const top = Math.round(f.getBoundingClientRect().top);
      w.remove();
      return top !== 0;     // true = the ancestor captured the fixed child
    };
    const containingBlock = {
      filter: cbProbe('filter:blur(0)'),
      backdropFilter: cbProbe('backdrop-filter:blur(3px)'),
      webkitBackdropFilter: cbProbe('-webkit-backdrop-filter:blur(3px)')
    };

    // SVG INTRINSIC SIZING — the cleanest engine discriminator available, and the
    // single highest-value area: a viewBox-only SVG has an intrinsic ratio but no
    // intrinsic size, and the engines resolve that differently. Chromium follows the
    // CSS default-sizing algorithm (contain against 300x150); WebKit uses the
    // viewBox numbers. Same uploaded logo, visibly different size.
    const svgNatural = await new Promise(res => {
      const img = new Image();
      const done = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onload = done; img.onerror = () => res({ w: -1, h: -1 });
      img.src = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"></svg>');
      setTimeout(() => res({ w: -1, h: -1 }), 1500);
    });
    // …and the layout consequence: the same SVG collapses to zero height as a
    // column-flex child in WebKit, so a logo renders as an invisible strip.
    const sv = document.createElement('div');
    sv.style.cssText = 'position:absolute;left:-9999px;display:flex;flex-direction:column;width:200px';
    sv.innerHTML = '<svg viewBox="0 0 100 50"></svg>';
    document.body.appendChild(sv);
    const svgFlexHeight = Math.round(sv.firstChild.getBoundingClientRect().height);
    const svgComputedWidth = getComputedStyle(sv.firstChild).width;
    sv.remove();

    const v = document.createElement('video');
    return {
      svg: { dataUriNatural: svgNatural, columnFlexHeight: svgFlexHeight,
        computedWidth: svgComputedWidth,
        collapses: svgFlexHeight === 0 },
      containingBlock,
      scroll: {
        anchoring: { shiftPx, anchored: shiftPx < 5 },
        snapProgrammatic: { viaScrollBy, viaScrollLeft, snapsOnProgrammaticScroll: viaScrollBy >= 100 },
        scrollendEvent: 'onscrollend' in window
      },
      layout: {
        aspectRatioWithOverflow: arOverflow,      // expect {w:200,h:200}; h:0 = the WebKit flex bug
        aspectRatioWithMaxHeight: arMaxHeight,    // expect ~{w:100,h:100}
        aspectRatioOk: arOverflow.h === 200 && arMaxHeight.h > 0
      },
      viewportUnits: { vh: vprobe('100vh'), svh: CSS.supports('height', '100svh') ? vprobe('100svh') : null,
        dvh: CSS.supports('height', '100dvh') ? vprobe('100dvh') : null, innerHeight },
      css: {
        has: CSS.supports('selector(:has(a))'), containerQueries: CSS.supports('container-type', 'inline-size'),
        subgrid: CSS.supports('grid-template-columns', 'subgrid'),
        textWrapBalance: CSS.supports('text-wrap', 'balance'),
        stretch: CSS.supports('height', 'stretch'),
        overflowAnchor: CSS.supports('overflow-anchor', 'auto'),
        safeAreaMaxInset: CSS.supports('bottom', 'env(safe-area-max-inset-bottom)'),   // Chromium 135+ only
        keyboardInset: CSS.supports('bottom', 'env(keyboard-inset-height)'),           // Chromium only
        webkitOverflowScrolling: CSS.supports('-webkit-overflow-scrolling', 'touch'),  // WebKit only
        webkitBackdropFilter: CSS.supports('-webkit-backdrop-filter', 'blur(1px)'),    // WebKit only
        backdropFilter: CSS.supports('backdrop-filter', 'blur(1px)'),                  // false on Safari <=17
        plusDarker: CSS.supports('mix-blend-mode', 'plus-darker'),                     // WebKit-only keyword
        overflowClipMargin: CSS.supports('overflow-clip-margin', '1px'),               // Chromium only
        // Tier-1 gaps that leave whole sections invisible on Safari <=18
        scrollDrivenAnimations: CSS.supports('animation-timeline', 'scroll()'),
        anchorPositioning: CSS.supports('anchor-name', '--x'),
        interpolateSize: CSS.supports('interpolate-size', 'allow-keywords'),
        fieldSizing: CSS.supports('field-sizing', 'content'),
        textSizeAdjust: CSS.supports('text-size-adjust', '100%')
      },
      media: {
        // codec answers from a bundled engine are NOT the answers real Safari gives
        webmVp9: v.canPlayType('video/webm; codecs="vp9"'),
        quicktimeHevcAlpha: v.canPlayType('video/quicktime; codecs="hvc1.1.6.H120.b0"'),
        av1: v.canPlayType('video/mp4; codecs="av01.0.05M.08"'),
        hevc: v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')
      },
      apis: {
        virtualKeyboard: 'virtualKeyboard' in navigator,        // Chromium only
        batteryStatus: 'getBattery' in navigator,               // Chromium only
        webkitFullscreenVideo: 'webkitSupportsFullscreen' in v  // WebKit only
      },
      caveat: 'Playwright webkit is WebKit trunk on a non-Apple port. Layout and scroll probes approximate ' +
        'real Safari; media/codec results do NOT, and no headless engine reproduces iOS chrome, touch ' +
        'momentum, the virtual keyboard or Low Power Mode. Roughly half of real iOS scroll defects are ' +
        'invisible here — a clean run is evidence about the engine, never about an iPhone.'
    };
  });
}

/* ── LOAD-TIME BEHAVIOUR ───────────────────────────────────────────────────────
 * Reload with a PerformanceObserver already armed, then report what moved. CLS is
 * the standard metric, but the useful output for a reviewer is the LIST of elements
 * that shifted — "the slider card jumps on load" is a fixable bug; "CLS 0.14" isn't.
 */
export async function loadShiftAudit(page, url, { settleMs = 3000 } = {}) {
  await page.addInitScript(() => {
    window.__shifts = []; window.__cls = 0;
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;          // user-triggered movement is fine
          window.__cls += e.value;
          (e.sources || []).forEach(s => { if (!s.node || !s.node.tagName) return;
            window.__shifts.push({ tag: s.node.tagName.toLowerCase(),
              cls: (typeof s.node.className === 'string' ? s.node.className : s.node.getAttribute?.('class') || '').slice(0, 40),
              value: +e.value.toFixed(4),
              moved: Math.round(Math.abs((s.currentRect?.top || 0) - (s.previousRect?.top || 0))) });
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* not supported — reported as unavailable below */ }
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(settleMs);

  return page.evaluate(() => {
    if (!Array.isArray(window.__shifts)) return { supported: false };
    // group by element so one card shifting five times reads as one finding
    const byEl = new Map();
    window.__shifts.forEach(s => { const k = s.tag + '.' + s.cls;
      const prev = byEl.get(k) || { el: k, shifts: 0, totalValue: 0, maxMovedPx: 0 };
      prev.shifts++; prev.totalValue = +(prev.totalValue + s.value).toFixed(4);
      prev.maxMovedPx = Math.max(prev.maxMovedPx, s.moved); byEl.set(k, prev); });
    const worst = [...byEl.values()].sort((a, b) => b.totalValue - a.totalValue).slice(0, 10);
    const cls = +window.__cls.toFixed(4);
    return { supported: true, cls,
      flag: cls > 0.25 ? 'POOR (>0.25)' : cls > 0.1 ? 'needs improvement (>0.1)' : 'good',
      shiftingElements: worst };
  });
}
