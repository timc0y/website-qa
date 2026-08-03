#!/usr/bin/env node
/*
 * check-crosspage.mjs — prove the between-pages checks fire, and prove they admit when
 * they had no way to look.
 *
 * The defect that motivated this module (every CMS item publishing one shared <title>) is
 * invisible from a single page, so the most important case here is the one-URL case: it
 * must report "not checked", never "no problems". A check that passes when it could not
 * see is the reason five collection templates shipped with the same title unnoticed.
 *
 *   node tests/check-crosspage.mjs
 */
import { crossPageAudit } from '../runner/lib/crosspage.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

const page = (url, seo) => ({ url, once: { a11y_seo: { seo: {
  title: 'Default title', metaDescription: 'A description that is long enough to be plausible for SEO.',
  canonical: url, og: { image: 'present' }, favicon: true, ...seo } } } });
const rep = (...urls) => ({ urls });
const kinds = r => r.findings.map(f => f.kind);

console.log('\ncrosspage.mjs — findings that only exist between pages\n');

// ── the blind spot must be declared, not silently passed ───────────────────────
{
  const r = crossPageAudit(rep(page('https://s.com/team/jane')));
  ok('one URL → checked:false', r.checked === false);
  ok('  …and it names the missing input', r.notes.some(n => /two URLs|--url/.test(n)), JSON.stringify(r.notes));
  ok('  …and reports no findings rather than a clean bill', r.findings.length === 0);
}

// ── the motivating defect ──────────────────────────────────────────────────────
{
  const r = crossPageAudit(rep(
    page('https://s.com/team/jane', { title: 'Exec Life' }),
    page('https://s.com/team/bob',  { title: 'Exec Life' })));
  const f = r.findings.find(x => x.kind === 'sharedTitle');
  ok('two items sharing one <title> → high finding', f && f.severity === 'high', JSON.stringify(kinds(r)));
  ok('  …recognised as templated (same path group)', f && f.group === '/team/');
  ok('  …and names the template cause', f && /template/.test(f.issue));
  ok('  …listing both URLs', f && f.urls.length === 2);
}
{
  // distinct titles in the same group must be silent
  const r = crossPageAudit(rep(
    page('https://s.com/team/jane', { title: 'Jane Doe — Exec Life' }),
    page('https://s.com/team/bob',  { title: 'Bob Roe — Exec Life' })));
  ok('distinct titles per item → no title finding', !kinds(r).includes('sharedTitle'), JSON.stringify(r.findings));
}

// ── shared canonical is the damaging one ───────────────────────────────────────
{
  const r = crossPageAudit(rep(
    page('https://s.com/team/jane', { canonical: 'https://s.com/team' }),
    page('https://s.com/team/bob',  { canonical: 'https://s.com/team' })));
  const f = r.findings.find(x => x.kind === 'sharedCanonical');
  ok('two pages sharing one canonical → high finding', f && f.severity === 'high', JSON.stringify(kinds(r)));
  ok('  …explaining the indexing consequence', f && /index/.test(f.issue));
}
{
  // self-canonical on every page is correct and must be silent
  const r = crossPageAudit(rep(page('https://s.com/a'), page('https://s.com/b')));
  ok('self-referential canonicals → silent', !kinds(r).includes('sharedCanonical') &&
    !kinds(r).includes('canonicalMismatch'), JSON.stringify(r.findings));
}
{
  // trailing slash and www are not a mismatch
  const r = crossPageAudit(rep(
    page('https://s.com/a/', { canonical: 'https://www.s.com/a' }),
    page('https://s.com/b',  { canonical: 'https://s.com/b/' })));
  ok('trailing slash / www differences are not reported as mismatches',
    !kinds(r).includes('canonicalMismatch'), JSON.stringify(r.findings));
}
{
  const r = crossPageAudit(rep(
    page('https://s.com/a', { canonical: 'https://s.com/somewhere-else' }),
    page('https://s.com/b')));
  ok('a canonical pointing at another page → reported', kinds(r).includes('canonicalMismatch'));
}

// ── shared description ─────────────────────────────────────────────────────────
{
  const r = crossPageAudit(rep(
    page('https://s.com/team/jane', { metaDescription: 'One description for all of them.' }),
    page('https://s.com/team/bob',  { metaDescription: 'One description for all of them.' })));
  ok('shared meta description → reported', kinds(r).includes('sharedDescription'));
}

// ── missing, across the set ────────────────────────────────────────────────────
{
  const r = crossPageAudit(rep(
    page('https://s.com/a', { title: '(missing)' }),
    page('https://s.com/b')));
  const f = r.findings.find(x => x.kind === 'missing' && x.field === 'title');
  ok('a missing title in the set → high finding', f && f.severity === 'high', JSON.stringify(kinds(r)));
  ok('  …and "(missing)" is not itself treated as a shared value',
    !kinds(r).includes('sharedTitle'), 'placeholder strings must never group as duplicates');
}
{
  // two pages both missing a title must not read as "sharing" one
  const r = crossPageAudit(rep(
    page('https://s.com/a', { title: '(missing)' }),
    page('https://s.com/b', { title: '(missing)' })));
  ok('two pages both missing a title → missing, not shared',
    kinds(r).includes('missing') && !kinds(r).includes('sharedTitle'), JSON.stringify(r.findings));
}

// ── cross-group duplication is reported, but not blamed on a template ──────────
{
  const r = crossPageAudit(rep(
    page('https://s.com/about', { title: 'Exec Life' }),
    page('https://s.com/contact', { title: 'Exec Life' })));
  const f = r.findings.find(x => x.kind === 'sharedTitle');
  ok('duplication across unrelated paths → reported without a template claim',
    f && f.group === null && !/template/.test(f.issue), JSON.stringify(f));
}

// ── a clean multi-page set says so ─────────────────────────────────────────────
{
  const r = crossPageAudit(rep(
    page('https://s.com/team/jane', { title: 'Jane', metaDescription: 'Jane’s own description, plenty long.' }),
    page('https://s.com/team/bob',  { title: 'Bob',  metaDescription: 'Bob’s own description, plenty long.' })));
  ok('a genuinely clean set → checked:true with no findings', r.checked && r.findings.length === 0,
    JSON.stringify(r.findings));
}

// ── a report with no SEO data at all must not crash ────────────────────────────
{
  const r = crossPageAudit({ urls: [{ url: 'https://s.com/a' }, { url: 'https://s.com/b' }] });
  ok('pages with no a11y_seo block → handled, checked:false', r.checked === false && r.pages === 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
