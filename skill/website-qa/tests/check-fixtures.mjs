#!/usr/bin/env node
/*
 * check-fixtures.mjs — prove the detectors fire, against DOM built to contain the defect.
 *
 * Written because a check returned empty on the page it was designed for and there was no way to
 * tell "the check is broken" from "the defect was fixed between runs" — the site had in fact been
 * edited mid-session. A fixture answers that in a second, and keeps answering it after the live
 * page changes again.
 *
 * Each case asserts both directions: the defect is caught, and a correct variant is NOT caught.
 * A detector that fires on everything is worse than no detector.
 *
 *   node tests/check-fixtures.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const script = n => readFileSync(join(HERE, '..', 'scripts', n), 'utf8');

const CASES = [
  {
    name: 'defaultRichText — Webflow stock demo content',
    script: 'audit_content.js',
    // the reset matters: Webflow projects commonly flatten rich-text headings to the body style,
    // which is the condition the nested-heading sub-check exists to catch. Without it the fixture
    // gets the browser's default h1..h6 sizes and the sub-check correctly stays quiet.
    bad: `<style>.w-richtext h1,.w-richtext h2,.w-richtext h3,.w-richtext h4,.w-richtext h5,.w-richtext h6{
            font:inherit;font-size:inherit;font-weight:300;margin:0 0 16px;display:inline}</style>
          <div class="text-rich-text w-richtext" style="font-size:16px">
            <h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>
            <h4>Heading 4</h4><h5>Heading 5</h5><h6>Heading 6</h6>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.</p>
            <blockquote>Block quote</blockquote>
            <p>Ordered list</p><ol><li>Item 1</li><li>Item 2</li></ol>
            <p>Unordered list</p><ul><li>Item A</li><li>Item B</li><li>Item C</li></ul>
            <p><a href="https://university.webflow.com/lesson/add-and-nest-text-link">Text link</a>
               <strong>Bold text</strong><em>Emphasis</em><sup>Superscript</sup><sub>Subscript</sub></p>
          </div>`,
    good: `<div class="text-rich-text w-richtext">
             <h2>About Key Man Insurance</h2>
             <p>Key person cover pays out to the business if a named individual dies.</p>
             <ul><li>Protects cash flow</li><li>Reassures lenders</li></ul>
           </div>`,
    read: r => r.defaultRichText.length,
    extra: r => r.defaultRichText[0]?.nestedHeadings?.allSameSizeAsBody === true
      ? 'also flagged unstyled nested headings' : 'nested-heading check did not fire'
  },
  {
    name: 'emptyMediaSlots — sized media box holding nothing',
    script: 'audit_layout.js',
    bad: `<div class="hero_media" style="width:800px;height:400px;background:#123"></div>`,
    // the overlay-over-a-real-image case that produced two false findings
    good: `<div class="hero_media" style="width:800px;height:400px;position:relative">
             <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400'%3E%3C/svg%3E"
                  style="width:800px;height:400px">
             <div class="hero_media-grad" style="position:absolute;inset:0"></div>
           </div>`,
    read: r => r.emptyMediaSlots.length
  },
  {
    name: 'customWidgetsWithoutSemantics — tab strip of bare divs, active tab has an extra class',
    script: 'audit_a11y_seo.js',
    bad: `<div class="who-help_tablist">
            <div class="who-help_tab is-active" style="cursor:pointer;width:200px;height:60px">Single Director</div>
            <div class="who-help_tab" style="cursor:pointer;width:200px;height:60px">Director &amp; Spouse</div>
            <div class="who-help_tab" style="cursor:pointer;width:200px;height:60px">Multiple Directors</div>
          </div>`,
    good: `<div class="who-help_tablist" role="tablist">
             <button class="who-help_tab is-active" role="tab" aria-selected="true" aria-controls="p1"
                     style="cursor:pointer;width:200px;height:60px">Single Director</button>
             <button class="who-help_tab" role="tab" aria-selected="false" aria-controls="p2"
                     style="cursor:pointer;width:200px;height:60px">Director &amp; Spouse</button>
             <button class="who-help_tab" role="tab" aria-selected="false" aria-controls="p3"
                     style="cursor:pointer;width:200px;height:60px">Multiple Directors</button>
           </div>`,
    read: r => r.accessibility.customWidgetsWithoutSemantics.length
  }
];

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1512, height: 900 } });
let pass = 0, fail = 0;

for (const c of CASES) {
  const src = script(c.script);
  const run = async html => {
    await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
    await page.waitForTimeout(120);
    return page.evaluate(src);
  };
  const onBad = c.read(await run(c.bad));
  const onGood = c.read(await run(c.good));
  const ok = onBad > 0 && onGood === 0;
  console.log(`${ok ? '✓' : '✗'} ${c.name}`);
  console.log(`    defective DOM → ${onBad} finding(s) ${onBad > 0 ? '(caught)' : '(MISSED)'}`);
  console.log(`    correct DOM   → ${onGood} finding(s) ${onGood === 0 ? '(clean)' : '(FALSE POSITIVE)'}`);
  if (c.extra) console.log(`    ${c.extra(await run(c.bad))}`);
  ok ? pass++ : fail++;
}

/* ── formAudit ────────────────────────────────────────────────────────────────
 * Needs its own case: it drives the page rather than evaluating a snapshot. Fixture-only by
 * necessity — the site this was written for has no form anywhere (every quote CTA lands on a
 * blank page), which is exactly the situation where a detector quietly rots unnoticed. */
const { formAudit } = await import('../runner/lib/forms.mjs');

const FORM_BAD = `<div class="w-form">
  <form name="quote" method="get">
    <input type="text" placeholder="Email address*">                        <!-- no name, no label, wrong type -->
    <label for="ph">Phone *</label><input id="ph" name="phone" type="text"> <!-- starred but not required -->
    <textarea name="msg" aria-label="Message" style="font-size:13px"></textarea>
    <input type="submit" value="Send">
  </form>
  <div class="w-form-done">Thank you! Your submission has been received!</div>
  <div class="w-form-fail">Oops! Something went wrong while submitting the form.</div>
</div>`;

const FORM_GOOD = `<div class="w-form">
  <form name="quote" method="post" action="/thanks" data-redirect="/thanks">
    <label for="e">Email address *</label><input id="e" name="email" type="email" required
      autocomplete="email" style="font-size:16px">
    <label for="p">Phone</label><input id="p" name="phone" type="tel" autocomplete="tel" style="font-size:16px">
    <label for="m">Message</label><textarea id="m" name="message" style="font-size:16px"></textarea>
    <input type="submit" value="Request a quote">
  </form>
  <div class="w-form-done">Thanks — we'll call you within one working day.</div>
  <div class="w-form-fail">That didn't send. Please email us at hello@example.com.</div>
</div>`;

for (const [label, html, expectFindings] of [['defective form', FORM_BAD, true], ['correct form', FORM_GOOD, false]]) {
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
  const r = await formAudit(page, { testBlurValidation: true });
  const n = r.findings.length;
  const ok = expectFindings ? n > 0 : n === 0;
  console.log(`${ok ? '✓' : '✗'} formAudit — ${label}: ${r.forms} form(s), ${n} finding(s)`);
  if (expectFindings) r.findings.slice(0, 6).forEach(f => console.log(`      ${f.severity}: ${f.issue.slice(0, 88)}`));
  else r.findings.forEach(f => console.log(`      FALSE POSITIVE → ${f.issue.slice(0, 88)}`));
  ok ? pass++ : fail++;
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
