/*
 * perturb.mjs — vary one input, re-measure, restore. Owner of "what will break next".
 *
 * Every other phase measures the page as served. That answers "is it broken now" and can
 * never answer "what breaks when someone edits it", which is the question behind most
 * client bug reports: a service gets renamed, a translator adds 12%, a webfont fails to
 * load on a hotel wifi, a reader has text zoom at 200%, a CMS image field is left empty.
 * Each of those is an INPUT, and each can be varied here before a person hits it in
 * production.
 *
 * The design rule that keeps this honest: a perturbation is DATA — a name, a page-side
 * mutation, and nothing else. There is no per-perturbation code path, so the phase cannot
 * grow special cases, and adding one is adding a row.
 *
 * Restoration is by reload, deliberately. Undoing DOM edits in place is where this kind of
 * tool starts lying: one missed revert and every later measurement in the run is taken
 * against a page nobody serves. A reload costs a second and cannot leave residue.
 *
 * Nothing here touches the site. Every mutation happens in this browser, to this render,
 * and dies with the page.
 */

/* Each perturbation answers one question, and its `question` is what gets reported —
 * a finding here is only useful if the reader can see which edit would cause it. */
export const PERTURBATIONS = [
  {
    name: 'longWord',
    question: 'what happens when an editor types a word longer than any currently on the page?',
    /* 24 characters is not arbitrary: it is about the length of the longest unbreakable
     * things real content actually contains — "Unternehmensberatung", "info@averylongdomain",
     * a 20-digit reference number, a hashtag. Injected into the LONGEST word of each text
     * node rather than appended, so the text keeps its shape and only the constraint moves. */
    apply: () => {
      const TOKEN = 'Unternehmensnachfolge000';
      let touched = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let n; while ((n = walker.nextNode())) if (n.textContent.trim().length > 3) nodes.push(n);
      for (const node of nodes) {
        const words = node.textContent.split(/(\s+)/);
        let best = -1, bestLen = 0;
        for (let i = 0; i < words.length; i++) if (!/^\s*$/.test(words[i]) && words[i].length > bestLen) { best = i; bestLen = words[i].length; }
        if (best < 0) continue;
        words[best] = TOKEN;
        node.textContent = words.join('');
        touched++;
      }
      return { touched };
    }
  },
  {
    name: 'longerText',
    question: 'what happens when the copy grows by half — a rewrite, or a language that runs long?',
    /* Pseudo-localisation's standard trick, and the reason it is standard: German, Finnish
     * and Russian routinely run 30–50% longer than English, and a design that only ever
     * saw English copy has never been tested at its real width. */
    apply: () => {
      let touched = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = []; let n;
      while ((n = walker.nextNode())) if (n.textContent.trim().length > 8) nodes.push(n);
      for (const node of nodes) {
        const t = node.textContent;
        const words = t.trim().split(/\s+/);
        const extra = words.slice(0, Math.ceil(words.length / 2)).join(' ');
        node.textContent = t + ' ' + extra;
        touched++;
      }
      return { touched };
    }
  },
  {
    name: 'fallbackFont',
    question: 'what happens on the render before the webfont arrives, or if it never does?',
    /* Not a hypothetical: it is what every first paint looks like, and what a blocked CDN
     * or a corporate proxy serves permanently. Fallback metrics differ enough to move
     * wrapping by a whole line, and `size-adjust` is exactly the fix nobody applies until
     * someone measures this. */
    apply: () => {
      const css = document.createElement('style');
      css.id = '__wqa_fallback_font';
      css.textContent = '*,*::before,*::after{font-family:' +
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif !important}';
      document.head.appendChild(css);
      return { touched: 1 };
    }
  },
  {
    name: 'textZoom200',
    question: 'what happens for a reader who has set text size to 200% (WCAG 1.4.4)?',
    /* Text-only zoom, not page zoom: page zoom scales everything and breaks nothing, which
     * is why it is the one everybody tests. Doubling the root font size while pixel-sized
     * boxes stay put is the real condition, and it is a legal requirement in most of the
     * jurisdictions these sites sell in. */
    apply: () => {
      const base = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      document.documentElement.style.setProperty('font-size', (base * 2) + 'px', 'important');
      return { touched: 1, rootFontSize: base * 2 };
    }
  },
  {
    name: 'imagesAbsent',
    question: 'what happens when a CMS image field is empty — does the layout survive?',
    /* The empty-field case is common and its failure is silent: the box collapses, the
     * section loses its height, and text lands on text. Hiding images reproduces exactly
     * what an unfilled field renders. */
    apply: () => {
      let touched = 0;
      for (const el of document.querySelectorAll('img,picture,video')) { el.style.display = 'none'; touched++; }
      const css = document.createElement('style');
      css.id = '__wqa_no_bg_images';
      css.textContent = '*{background-image:none !important}';
      document.head.appendChild(css);
      return { touched };
    }
  }
];

const NAMES = new Set(PERTURBATIONS.map(p => p.name));

/* Which defect kinds a perturbation can be blamed for. A perturbation that turns a
 * heading's colour suspicious has told us nothing; one that makes a box overflow, collide
 * or collapse has told us what the next edit does. */
const WATCHED = ['escapesParent', 'overlappingContent', 'textCollisions', 'textCannotFit',
  'nowrapOverflow', 'nearlyCollapsed', 'collapsedElements', 'clippedText'];

const identify = (kind, f) => `${kind}|${[f.el, f.covers, f.word, f.a && f.b ? `${f.a} × ${f.b}` : null, f.text]
  .filter(Boolean)[0] || kind}`;

const fingerprint = layout => {
  const set = new Set();
  for (const kind of WATCHED) for (const f of (layout?.[kind] || [])) set.add(identify(kind, f));
  return set;
};

/**
 * Run each perturbation at each width and report only what it CAUSED.
 *
 * `measure` is the runner's single measurement owner, passed in rather than imported, so
 * this module cannot drift from how the rest of the run measures a page. `reload` restores
 * the page between perturbations.
 *
 * Findings are the difference against the resting fingerprint at the same width: a defect
 * the page already had is not this perturbation's fault, and reporting it as such would
 * double every existing finding by however many perturbations run.
 */
export async function perturbationSweep(page, { widths, measure, reload, only = null, settle }) {
  const chosen = PERTURBATIONS.filter(p => !only || only.includes(p.name));
  const findings = [], skipped = [];
  if (only) for (const name of only) if (!NAMES.has(name)) skipped.push({ name, why: 'unknown perturbation' });

  for (const w of widths) {
    await reload();
    await page.setViewportSize({ width: w, height: 900 });
    if (settle) await settle();
    let resting;
    try { resting = await measure(page); } catch (e) { skipped.push({ width: w, why: 'resting measurement failed' }); continue; }
    const before = fingerprint(resting);

    for (const p of chosen) {
      await reload();
      await page.setViewportSize({ width: w, height: 900 });
      if (settle) await settle();
      let applied;
      try { applied = await page.evaluate(`(${p.apply.toString()})()`); }
      catch (e) { skipped.push({ width: w, perturbation: p.name, why: 'could not apply: ' + String(e.message || e).slice(0, 80) }); continue; }
      if (settle) await settle();
      let after;
      try { after = await measure(page); } catch (e) { skipped.push({ width: w, perturbation: p.name, why: 'measurement failed' }); continue; }

      for (const kind of WATCHED) for (const f of (after?.[kind] || [])) {
        const id = identify(kind, f);
        if (before.has(id)) continue;                 // already broken; not this edit's doing
        findings.push({ perturbation: p.name, question: p.question, width: w, kind,
          el: f.el || f.covers || f.a, detail: f,
          appliedTo: applied?.touched,
          confidence: 'measured under a stated perturbation',
          hint: `not broken as served. This appears once ${p.name === 'longWord'
            ? 'a longer unbreakable word reaches this element'
            : p.name === 'longerText' ? 'the copy here grows by about half'
            : p.name === 'fallbackFont' ? 'the webfont is unavailable and fallback metrics apply'
            : p.name === 'textZoom200' ? 'the reader doubles their text size'
            : 'this image is missing'}.` });
      }
    }
  }
  await reload();
  return {
    ran: chosen.map(p => p.name), widths, skipped,
    findings: findings.slice(0, 60),
    truncated: findings.length > 60 ? findings.length - 60 : undefined,
    note: 'Every finding here is a PREDICTION with its cause attached, and every one is ' +
      'absent from the page as served. Nothing was changed on the site: each perturbation ' +
      'is applied to this render and undone by reloading.'
  };
}
