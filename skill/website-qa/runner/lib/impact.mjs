/*
 * impact.mjs — order findings by what a reader loses, not by which detector found them.
 *
 * A report grouped by check kind makes the reader do the triage: eight low-contrast notes
 * sit above the one covered phone number, because "contrast" happened to run first. The
 * ordering that helps is by consequence — how much content is actually unreadable — and
 * that is measurable from what the detectors already record.
 *
 * Deliberately crude, and stated as such in the output. It ranks; it does not score
 * quality. A number that looked authoritative would get quoted back as one.
 */

/* Words are the unit of loss, because they are the unit of content. Pixels flatter big
 * type: a covered 72px hero word and a covered paragraph are not the same loss, and the
 * hero word is the smaller one. */
const words = text => (typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean).length : 0);
const px = value => (typeof value === 'string' ? parseInt(value, 10) || 0 : (value || 0));

/* Per finding kind: what "impact" means for that kind, in words-of-content-equivalent.
 * Kinds absent from this table rank at 0 and sort last — which is the honest answer for a
 * finding whose consequence nobody has articulated yet. */
const IMPACT = {
  // content the reader cannot see at all
  collapsedElements: f => 8 + words(f.text),
  emptyMediaSlots: () => 12,
  invisibleText: f => 6 + words(typeof f === 'string' ? '' : f.text),
  // content covered or cut: the overlap is a share of a line, so a word or two
  overlappingContent: f => { const [w, h] = String(f.overlap || '').split('×').map(px);
    return Math.max(2, Math.round((w * h) / 600)) + words(f.text); },
  textCollisions: f => 4 + words(f.aText) + words(f.bText),
  clippedText: f => Math.max(2, Math.round(px(f.hidesPx) / 60)),
  escapesParent: f => (f.outcome === 'clipped' ? 6 : 3) + words(f.text),
  // content still readable, but the layout is wrong
  textCannotFit: f => 3 + words(f.word),
  nowrapOverflow: f => 2 + words(f.text),
  nearlyCollapsed: f => 5 + words(f.text),
  unintendedWrapping: () => 1,
  lowContrast: f => (f.ratio < 2 ? 4 : 2),
  tinyTapTargets: () => 2,
  imageIssues: f => (/broken/.test(f.issue || '') ? 10 : 2),
  // nothing is lost yet, which is the whole point of it — ranked low, never zero
  slackAtRisk: () => 1
};

/**
 * Rank findings across kinds and breakpoints.
 *
 * `entry` is one URL's report node. Returns the ordered list, and the total, so a summary
 * can say "12 findings, 41 words of content affected" — a sentence a client understands and
 * a developer can argue with, which is more than a severity label offers.
 */
export function rankByImpact(entry, { limit = 20 } = {}) {
  const rows = [];
  for (const [width, bp] of Object.entries(entry?.byBreakpoint || {})) {
    if (!bp || bp.error) continue;
    for (const [kind, score] of Object.entries(IMPACT)) {
      for (const f of (bp[kind] || [])) {
        /* An unstable reading is not ranked with confirmed ones. It was measured twice and
         * appeared once; putting it in the same order as a reproducible finding is how a
         * timing artefact ends up at the top of a client report. */
        if (f && f.unstable) continue;
        /* And a detector that has already said "this is not a defect" is believed. The first
         * version of this file ranked `img.insights-card_img` top of the report at ~10 words
         * lost, on a finding whose own text reads "still loading when audited — NOT a defect".
         * Ranking must never overrule the measurement it is ranking. */
        if (f && f.severity === 'info') continue;
        rows.push({ kind, width: +width, wordsAffected: score(f) || 0,
          el: f.el || f.covers || f.a || (typeof f === 'string' ? f : undefined),
          finding: f });
      }
    }
  }
  /* One defect present at six widths is one defect. Keep the worst width and say how many
   * others it appeared at — a reader who sees the same line six times stops reading. */
  const byIdentity = new Map();
  for (const r of rows) {
    const key = r.kind + '|' + (r.el || JSON.stringify(r.finding).slice(0, 60));
    const prev = byIdentity.get(key);
    if (!prev) byIdentity.set(key, { ...r, widths: [r.width] });
    else { prev.widths.push(r.width);
      if (r.wordsAffected > prev.wordsAffected) Object.assign(prev, r, { widths: prev.widths }); }
  }
  /* Sweep findings rank too, or "worst first" contradicts the sweep section three headings
   * below it. The collision this whole family was built for exists from 992 to 1120px and at
   * none of the agreed breakpoints — so a ranking that reads only `byBreakpoint` puts the
   * report's most serious finding nowhere. Transient ones stay out: the sweep re-probed them
   * and they did not reproduce. */
  for (const f of entry?.once?.widthSweep?.findings || []) {
    if (f.transient) continue;
    const score = IMPACT[f.kind]; if (!score) continue;
    const key = f.kind + '|' + f.what;
    const detail = f.detail || {};
    if (detail.severity === 'info') continue;
    const prev = byIdentity.get(key);
    const row = { kind: f.kind, el: f.what, wordsAffected: score(detail) || 1,
      widths: [], range: f.range, finding: detail, fromSweep: true };
    if (!prev) byIdentity.set(key, row);
    else { prev.range = f.range; prev.fromSweep = true; }
  }
  const ranked = Array.from(byIdentity.values())
    .sort((a, b) => b.wordsAffected - a.wordsAffected || a.kind.localeCompare(b.kind));
  return {
    total: ranked.reduce((s, r) => s + r.wordsAffected, 0),
    findings: ranked.length,
    top: ranked.slice(0, limit).map(r => ({ kind: r.kind, el: r.el,
      wordsAffected: r.wordsAffected,
      // one defect at six widths is one defect; the same width twice is one width
      widths: Array.from(new Set(r.widths)).sort((a, b) => a - b),
      instances: r.widths.length || undefined,
      range: r.range, fromSweep: r.fromSweep || undefined,
      worstAt: r.width })),
    note: 'Ranked by content a reader loses, measured in words-of-content-equivalent. A ' +
      'ranking, not a score: it decides reading order and nothing else.'
  };
}
