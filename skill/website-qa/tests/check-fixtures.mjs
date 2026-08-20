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
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { createServer } from 'http';

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
  },
  {
    /* The defect the box-model family was written for, reduced to its bones: an absolutely
     * positioned card placed by hand, landing on a number. Nothing overflows the viewport,
     * nothing is clipped, no element is 0×0 — every pre-existing check stays silent. */
    name: 'overlappingContent — an absolutely positioned card covering a stat',
    script: 'audit_layout.js',
    bad: `<section style="position:relative;height:400px;width:900px">
            <div class="stat" style="position:absolute;left:600px;top:120px;width:220px;height:140px;background:#c0522a">
              <div class="stat_value" style="font-size:48px;color:#fff">1.2x</div>
              <p style="color:#fff">Average policy improvement</p>
            </div>
            <div class="quote" style="position:absolute;left:480px;top:140px;width:200px;height:170px;background:#f7f7f7">
              <blockquote>They saved me a lot of tax by switching my policy.</blockquote>
            </div>
          </section>`,
    // same two cards, placed clear of each other — the shape this must NOT report
    good: `<section style="position:relative;height:400px;width:900px">
             <div class="stat" style="position:absolute;left:660px;top:120px;width:220px;height:140px;background:#c0522a">
               <div class="stat_value" style="font-size:48px;color:#fff">1.2x</div>
               <p style="color:#fff">Average policy improvement</p>
             </div>
             <div class="quote" style="position:absolute;left:380px;top:140px;width:200px;height:170px;background:#f7f7f7">
               <blockquote>They saved me a lot of tax by switching my policy.</blockquote>
             </div>
           </section>`,
    read: r => r.overlappingContent.length
  },
  {
    /* A scrim over a photograph is the commonest out-of-flow box on any marketing page and
     * must never be reported, or this check drowns the report it lives in. */
    name: 'overlappingContent — a gradient scrim over a captioned photo is not a collision',
    script: 'audit_layout.js',
    bad: `<div style="position:relative;width:600px;height:300px">
            <p style="margin:0;padding:20px;width:260px">Insurance for business owners who cannot afford to stop.</p>
            <div class="card" style="position:absolute;left:100px;top:20px;width:300px;height:200px;background:#fff"></div>
          </div>`,
    good: `<div style="position:relative;width:600px;height:300px">
             <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='300'%3E%3C/svg%3E"
                  style="width:600px;height:300px">
             <div class="hero_media-grad" style="position:absolute;inset:0;background:linear-gradient(#0000,#000)"></div>
             <p style="position:absolute;left:20px;bottom:20px;margin:0;color:#fff">Business life insurance</p>
           </div>`,
    read: r => r.overlappingContent.length
  },
  {
    /* The other half of the collision family: no coverer, no background, just two runs of
     * type in the same pixels — here a heading whose box stopped growing with it. */
    name: 'textCollisions — a heading spilling out of its box onto the copy below',
    script: 'audit_layout.js',
    bad: `<div style="width:420px">
            <div class="card_head" style="height:34px">
              <h3 style="margin:0;font-size:30px;line-height:1.4">Shareholder protection for growing businesses</h3>
            </div>
            <p class="card_body" style="margin:0;font-size:16px">Cover that lets the remaining owners buy the shares.</p>
          </div>`,
    /* Layered, not colliding: an opaque panel is painted between the two runs, so a reader
     * sees one of them and nothing is wrong. webflow.com ships exactly this. */
    good: `<div style="position:relative;width:420px;height:120px">
             <p class="behind" style="position:absolute;top:40px;left:0;margin:0">"@type": "WebPageElement"</p>
             <div style="position:absolute;inset:0;background:#fff"></div>
             <h3 class="front" style="position:absolute;top:44px;left:0;margin:0;font-size:24px">Move the web forward</h3>
           </div>`,
    read: r => r.textCollisions.length
  },
  {
    name: 'textCannotFit — one unbreakable word wider than its fixed-width parent',
    script: 'audit_slack.js',
    bad: `<div style="width:180px;font-size:20px">Ask about
            <span style="display:block">Unternehmensnachfolgeversicherung</span></div>`,
    // identical text, told it may break — so it fits, and is not a defect
    good: `<div style="width:180px;font-size:20px;overflow-wrap:break-word">Ask about
             <span style="display:block;overflow-wrap:break-word">Unternehmensnachfolgeversicherung</span></div>`,
    read: r => r.textCannotFit.length
  },
  {
    name: 'nowrapOverflow — nowrap label that cannot fit the box it is given',
    script: 'audit_slack.js',
    bad: `<div style="width:90px;white-space:nowrap;font-size:18px;border:1px solid #000">Request a callback today</div>`,
    /* The false positive this replaced: an inline-block with horizontal padding and nowrap
     * content reports scrollWidth 109 against clientWidth 99 while its content measures 89
     * and fits — three confident findings on a nav that is not broken. */
    good: `<a style="display:inline-block;padding:0 10px;white-space:nowrap;font-size:18px">
             <span>Services</span><span style="display:inline-block;width:8px">&#9662;</span></a>`,
    read: r => r.nowrapOverflow.length
  },
  {
    name: 'escapesParent — a fixed-height card clipping the copy inside it',
    script: 'audit_layout.js',
    bad: `<div class="card" style="width:300px;height:70px;overflow:hidden">
            <p class="card_text" style="margin:0;font-size:16px;line-height:24px">Key person cover pays out to the
            business if a named individual dies, so payroll and lending covenants can still be met while you recruit
            a replacement, and the loss of the person the bank actually lent against does not become the loss of
            the company as well.</p>
          </div>`,
    /* The two shapes that made the naive version unusable: a slider track (wider than its
     * frame by design) and the two-arrow hover-slide inside a 20px clip box. */
    good: `<div class="services_carousel" style="width:300px;overflow:hidden">
             <div class="services_track" style="display:flex;width:900px">
               <div class="services_slide" style="width:300px">Relevant life</div>
               <div class="services_slide" style="width:300px">Key person</div>
               <div class="services_slide" style="width:300px">Shareholder</div>
             </div>
             <div class="arrow-circle" style="display:flex;width:20px;height:20px;overflow:hidden">
               <div class="arrow-circle_arrow" style="width:20px;height:20px;transition:transform .3s">&rarr;</div>
               <div class="arrow-circle_arrow is-next" style="width:20px;height:20px;transition:transform .3s">&rarr;</div>
             </div>
           </div>`,
    read: r => r.escapesParent.length
  },
  {
    /* The predictive case, and the reason `audit_slack.js` exists: nothing is broken here.
     * A label with two characters of headroom is one rename away from wrapping, and no
     * defect-shaped check can say so because there is no defect yet. */
    name: 'slackAtRisk — a label that fits with two characters to spare',
    script: 'audit_slack.js',
    // 15 monospace characters need 144px; 162px leaves 18px, which is two characters
    bad: `<div style="width:162px;font:16px/1.2 monospace;white-space:nowrap">Get a quote now</div>`,
    good: `<div style="width:300px;font:16px/1.2 monospace;white-space:nowrap">Get a quote now</div>`,
    read: r => r.slackAtRisk.length,
    extra: r => r.slackAtRisk[0]
      ? `headroom ${r.slackAtRisk[0].slackChars} char(s) / ${r.slackAtRisk[0].slackPx}px`
      : 'no slack measured'
  },
  {
    name: 'nearlyCollapsed — a flex item squashed to 3px while still holding content',
    script: 'audit_layout.js',
    bad: `<div style="display:flex;width:300px">
            <div style="flex:0 0 297px;height:60px;background:#eee">Main</div>
            <div class="side" style="min-width:0;height:60px;overflow:hidden"><p style="margin:0">Talk to our team</p></div>
          </div>`,
    // a 2px rule holds nothing, and must not be mistaken for a squashed box
    good: `<div style="display:flex;width:300px">
             <div style="flex:1;height:60px;background:#eee">Main</div>
             <div class="rule" style="width:2px;height:60px;background:#333"></div>
           </div>`,
    read: r => r.nearlyCollapsed.length
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

/* One-line assertion in this file's own style: print, count, move on. */
const assert = (name, cond, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond && detail) console.log(`    ${detail}`);
  cond ? pass++ : fail++;
};

/* ── audit_roles: shape beats names, and the detectors must actually consult it ──
 * The regression this pins down is precise. A carousel whose track is called
 * `services_track` matches no entry in any slider name list, so its clipping section
 * reported 1865px of "clipped copy" at every mobile width on every run. Roles identify the
 * track by its shape — near-equal children escaping the box that clips them — and
 * `audit_layout.js` then stays quiet. Both halves are asserted: the inference, and the
 * detector consuming it. */
{
  const ROLES_SRC = script('audit_roles.js');
  const LAYOUT_SRC = script('audit_layout.js');
  // deliberately named nothing like a carousel, and clipped by an ancestor with copy in it
  const CAROUSEL = `<section class="services" style="width:400px;overflow-x:clip">
      <h2>How we are helping</h2>
      <div class="services_viewport">
        <div class="services_track" style="display:flex;gap:16px;width:400px">
          <div class="services_item" style="flex:0 0 380px">Relevant life</div>
          <div class="services_item" style="flex:0 0 380px">Key person</div>
          <div class="services_item" style="flex:0 0 380px">Shareholder</div>
        </div>
      </div>
    </section>`;
  await page.setContent(`<!doctype html><html><body style="margin:0">${CAROUSEL}</body></html>`);
  await page.waitForTimeout(120);
  const roles = await page.evaluate(ROLES_SRC);
  assert('roles infer a track from shape, with no slider-ish class name in the DOM',
    roles.counts.track >= 1 && roles.counts.slide >= 3, JSON.stringify(roles.counts));
  const withRoles = await page.evaluate(LAYOUT_SRC);
  assert('…and audit_layout, consulting them, does not report the clipping section as clipped text',
    withRoles.clippedText.length === 0, JSON.stringify(withRoles.clippedText));

  // the hover-slide: two arrows in a box the size of one, with a real transition duration
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div class="ico" style="display:flex;width:20px;height:20px;overflow:hidden">
      <div class="ico_a" style="flex:0 0 20px;height:20px;transition:transform .3s">&rarr;</div>
      <div class="ico_b" style="flex:0 0 20px;height:20px;transition:transform .3s">&rarr;</div>
    </div></body></html>`);
  await page.waitForTimeout(120);
  const hover = await page.evaluate(ROLES_SRC);
  assert('roles infer a hover-reveal from behaviour (transition duration), not from a name',
    (hover.counts.hoverReveal || 0) >= 2, JSON.stringify(hover.counts));

  /* And the property that keeps this from being a framework: every audit still runs alone.
   * A person pasting one file into a console gets the weaker class-name fallback, not a
   * crash and not silence. */
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div class="card" style="width:300px;height:40px;overflow:hidden"><p style="margin:0">
    Cover that pays out to the business if a named individual dies, so payroll and lending
    covenants can still be met while a replacement is recruited.</p></div></body></html>`);
  await page.waitForTimeout(120);
  const alone = await page.evaluate(`(() => { delete window.__WQA_ROLES; return true; })()`);
  const noRoles = await page.evaluate(LAYOUT_SRC);
  assert('audit_layout still works with no role pass at all (console fallback)',
    alone === true && noRoles.escapesParent.length >= 1, JSON.stringify(noRoles.escapesParent).slice(0, 120));
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

await page.setContent(`<div style="display:none"><form name="cart"><button type="submit">Apply</button></form></div>`);
{
  const r = await formAudit(page);
  const ok = r.forms === 0 && r.hiddenFormsDeferred === 1 && r.findings.length === 0;
  console.log(`${ok ? '✓' : '✗'} formAudit — hidden form is deferred, not reported as a broken visible form`);
  ok ? pass++ : fail++;
}

await page.setContent(`<form name="redirecting" data-redirect="/thanks"><label>Email<input name="email" type="email"></label><button type="submit">Send</button></form>`);
{
  const r = await formAudit(page, { testBlurValidation: false });
  const ok = !r.findings.some(f => /success state/i.test(f.issue));
  console.log(`${ok ? '✓' : '✗'} formAudit — redirect-only success path does not require a static success node`);
  ok ? pass++ : fail++;
}

/* A valid target=_blank link changes browsing context, not the current page. This exact
 * shape was reported DEAD on a live site until the click audit watched popup pages. */
const { ctaClickAudit, scrollAudit } = await import('../runner/lib/interact.mjs');
const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(req.url === '/next' ? '<h1>Destination</h1>' : '<a class="btn" target="_blank" href="/next">Member login</a>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
{
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  await page.goto(url);
  const r = await ctaClickAudit(page, { url, settleMs: 100, vocab: { ctaLike: 'a.btn', ctaExclude: 'form' } });
  const ok = r.dead.length === 0 && r.results[0]?.verdict.startsWith('opens a new page');
  console.log(`${ok ? '✓' : '✗'} ctaClickAudit — target=_blank is a responding CTA`);
  ok ? pass++ : fail++;
}
await new Promise(resolve => server.close(resolve));

await page.setContent('<style>html{scroll-behavior:smooth}</style><main style="height:4000px">Long page</main>');
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
{
  const r = await scrollAudit(page, { step: 500, maxSteps: 3 });
  const ok = r.scrollSteps === 3;
  console.log(`${ok ? '✓' : '✗'} scrollAudit — resets same-route scroll restoration to the top`);
  ok ? pass++ : fail++;
}

/* A visual cap must sample the full document, including its final viewport. */
const { visionCapture } = await import('../runner/lib/vision.mjs');
const visionDir = mkdtempSync(join(tmpdir(), 'website-qa-vision-'));
await page.setViewportSize({ width: 390, height: 500 });
await page.setContent('<main style="height:6000px;background:linear-gradient(#fff,#000)"><h1>Top</h1></main><footer style="height:200px">Footer</footer>');
{
  const r = await visionCapture(page, { dir: visionDir, width: 390, maxTiles: 4, settleMs: 10, hideOverlays: false });
  const last = r.tiles.at(-1)?.scrollY;
  const ok = r.tiles.length === 4 && last === r.docHeight - r.viewportHeight && !!r.sampledAt;
  console.log(`${ok ? '✓' : '✗'} visionCapture — capped tiles include the page tail`);
  ok ? pass++ : fail++;
}
rmSync(visionDir, { recursive: true, force: true });

const { summarizeConsole } = await import('../runner/lib/console.mjs');
{
  const r = summarizeConsole([
    { type: 'error', text: 'Blocked inline script abc', sourceUrl: 'https://site.test/' },
    { type: 'error', text: 'Blocked inline script abc', sourceUrl: 'https://site.test/' },
    { type: 'error', text: "Access to XMLHttpRequest at 'https://tracker.test/pixel' from origin 'https://site.test' was blocked", sourceUrl: 'https://site.test/' }
  ], 'https://site.test/');
  const ok = r.events === 3 && r.unique === 2 && r.firstPartyEvents === 2 && r.thirdPartyEvents === 1 &&
    Array.isArray(r.groups) && r.groups.length === 2;
  console.log(`${ok ? '✓' : '✗'} console summary — de-duplicates and attributes origin`);
  ok ? pass++ : fail++;
}
{
  const r = summarizeConsole([{ type: 'error',
    text: "Executing inline script violates script-src 'self' https://cdn.example.test",
    sourceUrl: 'https://site.test/' }], 'https://site.test/');
  const ok = r.firstPartyEvents === 1 && r.thirdPartyEvents === 0;
  console.log(`${ok ? '✓' : '✗'} console summary — CSP allowlist URLs do not steal origin attribution`);
  ok ? pass++ : fail++;
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
