/*
 * registry.mjs — what the audits produce, declared once.
 *
 * Written after paying the same bill three times. Adding one detector to
 * `audit_layout.js` meant editing five files: the audit, the finding-array list in
 * `finding-ids.mjs`, three maps in `regress.mjs`, a summary line in `qa_runner.mjs`, and
 * the interpretation table in `platform-notes.md`. Four of those five edits carry no
 * judgement at all — they restate "this array holds findings, count it, name it" — and the
 * failure mode when one is forgotten is silent: the detector runs, finds the defect, and
 * the defect never reaches the report or the baseline.
 *
 * So the audits keep owning DETECTION and this file owns the ANSWER SHAPE: which arrays
 * hold findings, what each is called in a report, whether it is high-signal, how it is
 * counted between runs, and how one finding is identified across runs. The runner, the
 * regression diff, the finding index and the summary all read it. A new detector is one
 * file plus one row.
 *
 * What this deliberately is NOT: a plugin loader. Nothing discovers audits, nothing
 * versions an API, nothing runs outside this repository. Audits are still plain IIFEs
 * evaluated by filename, and they still paste into a browser console on their own, which
 * is the property that stops this becoming a framework.
 *
 * Metric ids are FROZEN by the baselines already on disk. `layout.collapsed` reads
 * `collapsedElements`; the id and the array name disagree and must keep disagreeing, or
 * every stored run becomes incomparable and the diff reports a whole page of phantom new
 * findings. Add ids; never rename one.
 */

const len = a => (Array.isArray(a) ? a.length : 0);

/* Findings produced per breakpoint by `audit_layout.js`.
 *
 * `severity: 'high'` means "count this toward the run's headline number" — content a
 * reader loses, not a value a reviewer might disagree with. `identity` turns a count into
 * a name across runs, and only exists where a stable name is available: a count alone
 * missed a real regression once already (an image issue changing KIND while the count
 * stayed at 1), so anything with a durable selector gets one. It must never include a
 * value that changes on every deploy — a hashed asset filename made every image look
 * newly broken. */
export const LAYOUT_FINDINGS = [
  { array: 'collapsedElements', metric: 'layout.collapsed', severity: 'high',
    label: 'elements collapsed to 0×0', bit: 'collapsed', identity: f => f.el },
  { array: 'nearlyCollapsed', metric: 'layout.nearlyCollapsed', severity: 'high',
    label: 'elements squashed under 4px', bit: 'squashed under 4px', identity: f => f.el },
  { array: 'escapesParent', metric: 'layout.escapesParent', severity: 'high',
    label: 'elements outside their parent box', bit: 'escaping their parent',
    // clipped and spilling are different findings to a reader: one is content missing from
    // the screen, the other is content landing on its neighbour
    detail: list => { const cut = list.filter(f => f.outcome === 'clipped').length;
      return cut ? ` (${cut} cut off)` : ''; },
    identity: f => `${f.el} out of ${f.parent} (${f.outcome})` },
  { array: 'overlappingContent', metric: 'layout.overlappingContent', severity: 'high',
    label: 'content covered by another box', bit: 'box(es) covering content', warn: true,
    identity: f => `${f.covers} under ${f.coveredBy}` },
  { array: 'textCollisions', metric: 'layout.textCollisions', severity: 'high',
    label: 'text printed over other text', bit: 'text-on-text collision(s)', warn: true,
    identity: f => `${f.a} × ${f.b}` },
  { array: 'textCannotFit', metric: 'layout.textCannotFit', severity: 'high',
    label: 'words wider than their container', bit: 'word(s) wider than their box',
    identity: f => `${f.el} — "${f.word}"` },
  { array: 'nowrapOverflow', metric: 'layout.nowrapOverflow',
    label: 'nowrap text that does not fit', bit: 'nowrap overflow' },
  { array: 'unintendedWrapping', metric: 'layout.wrapping',
    label: 'short labels wrapping to two lines', bit: 'wrapping' },
  { array: 'clippedText', metric: 'layout.clippedText',
    label: 'clipped text', bit: 'clipped text', identity: f => f.el },
  { array: 'imageIssues', metric: 'layout.imageIssues',
    label: 'image problems', bit: 'image',
    // element + KIND, not the src: a hashed filename changes every deploy, and the kind
    // changing while the count holds is the regression this identity exists for
    identity: f => `${f.el || 'img'} — ${f.issue || 'issue'}` },
  { array: 'emptyMediaSlots', metric: 'layout.emptyMediaSlots', severity: 'high',
    label: 'media slots with no resolved source', bit: 'EMPTY media slot(s)', warn: true,
    identity: f => f.el },
  { array: 'lowContrast', metric: 'layout.lowContrast',
    label: 'text below the contrast minimum', bit: 'low-contrast' },
  { array: 'invisibleText', metric: 'layout.invisibleText',
    label: 'invisible text', identity: f => (typeof f === 'string' ? f : f.el) },
  { array: 'tinyTapTargets', metric: 'layout.tinyTapTargets',
    label: 'tap targets under the minimum', bit: 'tiny tap target(s)' },
  { array: 'slackAtRisk', metric: 'layout.slackAtRisk',
    label: 'boxes within a few characters of overflowing', bit: 'box(es) nearly out of room',
    identity: f => f.el }
];

/* Findings produced per breakpoint by `audit_polish.js`, which nests its output under
 * `bp.polish`. Same declaration, different address — hence an explicit `pick`. */
export const POLISH_FINDINGS = [
  { metric: 'polish.gutterOutliers', label: 'container gutter outliers',
    pick: bp => bp?.polish?.containerGutters?.outliers },
  { metric: 'polish.oversizedSvgs', label: 'oversized SVGs', pick: bp => bp?.polish?.svg?.oversized },
  { metric: 'polish.falseAffordance', label: 'elements that look clickable and are not',
    pick: bp => bp?.polish?.falseAffordance },
  { metric: 'polish.missingGaps', label: 'flex/grid groups with no gap', pick: bp => bp?.polish?.missingGaps },
  { metric: 'polish.cmsEmptyLists', label: 'CMS lists rendering empty',
    pick: bp => bp?.polish?.cmsEmptyStates?.emptyLists, identity: f => f.el },
  { metric: 'polish.cmsEmptyBindings', label: 'CMS bindings rendering empty',
    pick: bp => bp?.polish?.cmsEmptyStates?.emptyBindings, identity: f => f.el },
  { metric: 'polish.upscaledImages', label: 'upscaled / pixelated images', pick: bp => bp?.polish?.upscaledImages },
  { metric: 'polish.duplicateIcons', label: 'repeated icons', pick: bp => bp?.polish?.duplicateIcons },
  { metric: 'polish.wrappedGroups', label: 'wrapped button groups', pick: bp => bp?.polish?.wrappedGroups },
  { metric: 'polish.hitTestBlocked', label: 'controls blocked by another element',
    pick: bp => bp?.polish?.hitTestBlocked },
  { metric: 'polish.duplicateListItems', label: 'duplicate list items', pick: bp => bp?.polish?.duplicateListItems },
  { metric: 'polish.aspectRatioBroken', label: 'aspect-ratio not honoured',
    pick: bp => bp?.polish?.aspectRatioNotHonoured }
];

/* Per-breakpoint measurements that are not arrays of findings. Declared here so the
 * regression diff can read one table rather than two. */
export const LAYOUT_SCALARS = [
  { metric: 'layout.scrollsSideways', label: 'page scrolls sideways',
    count: bp => (bp?.horizontalOverflow?.pageScrollsSideways ? 1 : 0) },
  { metric: 'layout.overflow', label: 'elements overflowing horizontally',
    count: bp => len(bp?.horizontalOverflow?.offenders) }
];

const withPick = entry => ({ ...entry, pick: entry.pick || (bp => bp?.[entry.array]) });

/* One flat table, which is what every consumer actually wants. */
export const AUDIT_METRICS = [
  ...LAYOUT_SCALARS,
  ...LAYOUT_FINDINGS.map(withPick).map(e => ({ ...e, count: e.count || (bp => len(e.pick(bp))) })),
  ...POLISH_FINDINGS.map(withPick).map(e => ({ ...e, count: e.count || (bp => len(e.pick(bp))) }))
];

/* Array names the finding index must stamp with stable ids. Structural names ('findings',
 * 'errors', …) stay in `finding-ids.mjs`: they belong to no single audit. */
export const FINDING_ARRAY_NAMES = LAYOUT_FINDINGS.map(e => e.array).filter(Boolean);

/* The summary's per-breakpoint line. `warn` earns the ⚠︎ that makes a reader stop. */
export const SUMMARY_BITS = AUDIT_METRICS
  .filter(e => e.bit)
  .map(e => ({ bit: e.bit, warn: !!e.warn, severity: e.severity, count: e.count,
    detail: e.detail, pick: e.pick }));

/* Metric id → human label, for the regression section. */
export const METRIC_LABELS = Object.fromEntries(AUDIT_METRICS.map(e => [e.metric, e.label]));
