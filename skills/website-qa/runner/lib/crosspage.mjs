/*
 * crosspage.mjs — findings that only exist BETWEEN pages.
 *
 * Every other audit here sweeps one URL at a time, and there is a whole class of defect
 * that is structurally invisible from inside a single page. The one that prompted this:
 * a dynamic route template writes its `<title>` once, so every generated item carries
 * the same title. Each item page is internally perfectly correct — a title is
 * present, the right length, not duplicated *on that page* — and a per-URL sweep reports
 * nothing. Five collection templates on the reference site shipped with a single shared
 * title and nobody noticed, because nothing ever put two item pages side by side.
 *
 * The same shape covers shared canonicals (every item canonicalising to one URL, which
 * tells a search engine the other items do not exist) and shared meta descriptions.
 *
 * This needs at least two URLs from the same template to say anything, so when it is given
 * only one it says THAT rather than returning an empty pass — a check that reports "no
 * problems" when it had no way to look is worse than no check.
 */

/* Compare URLs the way a search engine roughly does: scheme and www are not identity,
 * a trailing slash is not identity, but the path is. */
const normUrl = u => {
  if (!u || typeof u !== 'string') return '';
  try {
    const p = new URL(u);
    return (p.host.replace(/^www\./, '') + p.pathname.replace(/\/+$/, '')).toLowerCase() || p.host;
  } catch { return String(u).trim().toLowerCase().replace(/\/+$/, ''); }
};

/* First path segment. `/team/jane` and `/team/bob` share a template far more often than
 * not, and grouping by it is what lets the report say "both items under /team/" instead of
 * "two unrelated pages happen to match". */
const groupOf = u => {
  try { const seg = new URL(u).pathname.split('/').filter(Boolean); return seg.length ? '/' + seg[0] + '/' : '/'; }
  catch { return '/'; }
};

const MISSING = v => !v || /^\(missing\)$/i.test(String(v));
const norm = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/* Group values → [{ value, urls }] for values shared by more than one URL. */
function sharedValues(pages, pick) {
  const by = new Map();
  for (const p of pages) {
    const v = norm(pick(p));
    if (!v || MISSING(v)) continue;
    if (!by.has(v)) by.set(v, []);
    by.get(v).push(p.url);
  }
  return [...by.entries()].filter(([, urls]) => urls.length > 1).map(([value, urls]) => ({ value, urls }));
}

/**
 * Cross-page audit over a whole report.
 * Returns null when there is nothing to say at all, so the summary can stay quiet.
 */
export function crossPageAudit(report) {
  const pages = (report.urls || []).map(e => ({
    url: e.url,
    seo: e.once?.a11y_seo?.seo || null
  })).filter(p => p.seo);

  const notes = [], findings = [];

  if (pages.length < 2) {
    /* Deliberately loud about its own blind spot. The defect this module exists for cannot
     * be seen from one page, and the fix is one extra --url, so say so. */
    notes.push('only one page was swept, so per-template duplication (shared <title>, shared canonical ' +
      'across generated or CMS-driven pages) could not be checked at all. Pass two URLs from the same route/template family ' +
      '— e.g. --url=/team/person-a --url=/team/person-b — to check it.');
    return { checked: false, pages: pages.length, notes, findings };
  }

  const groups = [...new Set(pages.map(p => groupOf(p.url)))];

  // ── shared canonical: the most damaging of the three ─────────────────────────
  const inSharedCanonical = new Set();
  for (const { value, urls } of sharedValues(pages, p => p.seo.canonical)) {
    // several distinct pages declaring one canonical means the others ask not to be indexed
    const distinct = new Set(urls.map(normUrl));
    if (distinct.size < 2) continue;
    urls.forEach(u => inSharedCanonical.add(u));
    findings.push({
      severity: 'high', kind: 'sharedCanonical', value, urls,
      issue: `${urls.length} pages declare the same canonical URL (${value}) — every page but that one is ` +
        'telling search engines it is a duplicate and should not be indexed. This usually means one ' +
        'hard-coded canonical in a shared route or page template.'
    });
  }

  /* ── canonical pointing at a different page than itself ───────────────────────
   * Skipped for anything already named in a sharedCanonical finding. Pages that share a
   * hard-coded canonical each also, trivially, mismatch their own URL — reporting both is
   * the same defect twice, and the shared-canonical line is the one that names the cause. */
  for (const p of pages) {
    const c = p.seo.canonical;
    if (MISSING(c) || inSharedCanonical.has(p.url)) continue;
    if (normUrl(c) && normUrl(c) !== normUrl(p.url))
      findings.push({
        severity: 'medium', kind: 'canonicalMismatch', url: p.url, urls: [p.url], value: c,
        issue: `canonical points at ${c}, not at this page — intentional only if this really is a duplicate`
      });
  }

  // ── shared title / description, template-aware ───────────────────────────────
  for (const [kind, pick, what] of [
    ['sharedTitle', p => p.seo.title, '<title>'],
    ['sharedDescription', p => p.seo.metaDescription, 'meta description']
  ]) {
    for (const { value, urls } of sharedValues(pages, pick)) {
      const sameGroup = new Set(urls.map(groupOf));
      const templated = sameGroup.size === 1 && urls.length > 1;
      findings.push({
        severity: 'high', kind, value, urls, group: templated ? [...sameGroup][0] : null,
        issue: templated
          ? `every one of these ${urls.length} pages under ${[...sameGroup][0]} publishes the same ${what} ` +
            `("${value.slice(0, 80)}") — the shared template sets it once and no page overrides it. ` +
            'Bind it to the route or item\'s own data.'
          : `${urls.length} pages share one ${what} ("${value.slice(0, 80)}")`
      });
    }
  }

  // ── missing outright, across the set ─────────────────────────────────────────
  for (const [field, what] of [['title', '<title>'], ['metaDescription', 'meta description'], ['canonical', 'canonical']]) {
    const missing = pages.filter(p => MISSING(p.seo[field])).map(p => p.url);
    if (missing.length)
      findings.push({ severity: field === 'title' ? 'high' : 'medium', kind: 'missing', field, urls: missing,
        issue: `${missing.length} of ${pages.length} pages have no ${what}` });
  }

  if (groups.length > 1)
    notes.push(`pages span ${groups.length} path groups (${groups.join(', ')}) — duplication is reported as ` +
      'templated only when every page sharing a value sits in the same group');

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { checked: true, pages: pages.length, groups, notes, findings };
}

/** Markdown lines for summary.md. Returns [] when there is nothing worth printing. */
export function renderCrossPageSection(cp) {
  if (!cp) return [];
  const lines = ['', '### Across pages (template metadata duplication)'];
  if (!cp.checked) { cp.notes.forEach(n => lines.push(`- not checked: ${n}`)); return lines; }
  if (!cp.findings.length) {
    lines.push(`- ${cp.pages} pages compared — titles, descriptions and canonicals are all distinct.`);
    return lines;
  }
  for (const f of cp.findings) {
    lines.push(`- ${f.severity.toUpperCase()} · ${f.kind}: ${f.issue}`);
    (f.urls || []).slice(0, 6).forEach(u => lines.push(`  - ${u}`));
    if ((f.urls || []).length > 6) lines.push(`  - …${f.urls.length - 6} more`);
  }
  cp.notes.forEach(n => lines.push(`- note: ${n}`));
  return lines;
}
