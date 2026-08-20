/*
 * engines.mjs — what differs between two engines, and nothing else.
 *
 * Owner of one comparison. Reporting WebKit's raw findings would just double the noise;
 * what is actionable is the DELTA, because an element that overflows in Safari and not in
 * Chrome is a browser bug and those are the ones that come back from a client on an iPhone.
 *
 * Lifted out of the runner to be provable. Both functions are pure — two report shapes in,
 * a list of differences out — and while they lived inside a 1,200-line orchestrator the
 * only way to exercise them was a full two-engine run against a live site, which is why
 * they were the least-tested judgement in the sweep.
 */

/* Which defect counts differ between engines, per breakpoint. Counts, not contents:
   selectors and text are identical across engines, so a changed count is the signal
   and the detail lives in each engine's own findings block. */
export function diffEngines(a, b, widths, nameA, nameB) {
  const metrics = {
    overflow: L => L.horizontalOverflow?.offenders?.length || 0,
    scrollsSideways: L => (L.horizontalOverflow?.pageScrollsSideways ? 1 : 0),
    collapsed: L => L.collapsedElements?.length || 0,
    wrapping: L => L.unintendedWrapping?.length || 0,
    clippedText: L => L.clippedText?.length || 0,
    gutterOutliers: L => L.polish?.containerGutters?.outliers?.length || 0,
    wrappedGroups: L => L.polish?.wrappedGroups?.length || 0,
    missingGaps: L => L.polish?.missingGaps?.length || 0,
    // the headline cross-browser check: an SVG that sizes correctly in one engine
    // and blows up in another is the single most common Safari-only layout bug
    oversizedSvgs: L => L.polish?.svg?.oversized?.length || 0,
    widestSvgPx: L => Math.round(Math.max(0, ...(L.polish?.svg?.oversized || []).map(s =>
      parseInt(String(s.rendered).split('x')[0], 10) || 0)))
  };
  const out = [];
  for (const w of widths) {
    const A = a[w], B = b[w]; if (!A || !B || A.error || B.error) continue;
    for (const [name, f] of Object.entries(metrics)) {
      const va = f(A), vb = f(B);
      if (va !== vb) out.push({ breakpoint: w, metric: name, [nameA]: va, [nameB]: vb,
        hint: `${name} differs between ${nameA} and ${nameB} at ${w}px — likely a browser-specific rendering bug` });
    }
  }
  return out;
}

/* Sweep ranges, engine against engine. A range in one engine only is the finding — that is
 * the "it looks fine on my machine, my client sent me a photo of it broken" case. Ranges are
 * compared by identity (kind + element), not by their endpoints, because a band shifting by
 * one step is the same defect and reporting it as two would bury the real difference. */
export function diffSweeps(a, b, nameA, nameB) {
  const key = f => `${f.kind}|${f.what}`;
  const A = new Map((a?.findings || []).map(f => [key(f), f]));
  const B = new Map((b?.findings || []).map(f => [key(f), f]));
  const out = [];
  for (const [k, f] of A) if (!B.has(k))
    out.push({ what: f.what, kind: f.kind, range: f.range, onlyIn: nameA,
      hint: `present in ${nameA} (${f.range}) and absent in ${nameB} — engine-specific` });
  for (const [k, f] of B) if (!A.has(k))
    out.push({ what: f.what, kind: f.kind, range: f.range, onlyIn: nameB,
      hint: `present in ${nameB} (${f.range}) and absent in ${nameA} — engine-specific, and the ` +
        `kind of defect a client reports from a device the primary engine never shows` });
  for (const [k, f] of A) { const g = B.get(k); if (g && g.range !== f.range)
    out.push({ what: f.what, kind: f.kind, [nameA]: f.range, [nameB]: g.range,
      hint: 'same defect, different width band per engine' }); }
  return out;
}

