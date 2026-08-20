/*
 * audit_a11y_seo.js — accessibility, SEO/AEO/meta, and rendering-health checks.
 * No Figma needed. Paste into a browser javascript_exec call.
 */
(async () => {
  const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
  const desc = el => el.tagName.toLowerCase() +
    (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 2).join('.') : '');
  const meta = n => { const m = document.querySelector(`meta[name="${n}"],meta[property="${n}"]`);
    return m ? (m.content || '').trim() : null; };

  // --- SEO / document head ---
  const title = (document.title || '').trim();
  const seo = {
    title: title || '(missing)',
    titleLength: title.length,
    titleFlag: !title ? 'missing' : (title.length < 15 ? 'short (<15)' : title.length > 62 ? 'long (>62, truncates in SERP)' : 'ok'),
    metaDescription: meta('description') || '(missing)',
    metaDescriptionLength: (meta('description') || '').length,
    metaDescriptionFlag: !meta('description') ? 'missing' :
      ((meta('description').length < 50 || meta('description').length > 160) ? 'length off (aim 50-160)' : 'ok'),
    canonical: (document.querySelector('link[rel=canonical]') || {}).href || '(missing)',
    viewportMeta: !!document.querySelector('meta[name=viewport]'),
    htmlLang: document.documentElement.getAttribute('lang') || '(missing)',
    og: { title: meta('og:title'), description: meta('og:description'), image: meta('og:image') ? 'present' : '(missing)' },
    favicon: !!document.querySelector('link[rel~="icon"]')
  };

  /* --- Heading hierarchy ---
   *
   * Screen readers and SEO crawlers navigate a page by its heading outline, not by visual
   * size. That outline is broken by three things a purely-visual check would never catch:
   * zero h1s (no page topic), more than one h1 (no single topic), and a level skip like
   * h2 straight to h4 (a missing rung — assistive tech announces "entering a level-4
   * region" with nothing to say what level 3 was). Only elements with real box area count;
   * a hidden mobile-only duplicate heading isn't part of the rendered outline at this width. */
  const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return (r.width > 0 || r.height > 0) && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const headingEls = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible);
  const headingList = headingEls.map(h => ({ level: +h.tagName[1],
    text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80), el: desc(h) }));
  const h1s = headingList.filter(h => h.level === 1);
  const hierarchyIssues = [];
  if (!h1s.length) hierarchyIssues.push('no visible <h1> on the page');
  if (h1s.length > 1) hierarchyIssues.push(`${h1s.length} visible <h1> elements (expected exactly 1) — ` +
    h1s.map(h => `"${h.text}"`).join(', '));
  let prevLevel = 0;
  headingList.forEach(h => {
    if (prevLevel && h.level > prevLevel + 1) {
      hierarchyIssues.push(`level skips from h${prevLevel} to h${h.level} at "${h.text}" — ` +
        `no h${prevLevel + 1} in between`);
    }
    prevLevel = h.level;
  });
  const headings = { outline: headingList, h1Count: h1s.length, issues: hierarchyIssues };

  /* --- Title-tag semantic quality ---
   *
   * `titleFlag` above only measures length. A title can be exactly 40 characters and still
   * be "Home", a leftover template default, or a string that shares no words with what the
   * page is actually about — none of which a length check sees. This is a heuristic, not a
   * verdict: flag it as SUSPECTED and let a person confirm the title is wrong for this page,
   * not merely short or generic-looking. */
  const GENERIC_TITLE = /^(home|untitled|new page|page\s*\d*|test(\s*item)?|lorem ipsum|template|default|welcome|index)$/i;
  const STOPWORDS = /^(the|and|for|with|from|this|that|your|our|are|was|were|has|have|will|about)$/i;
  const words = s => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOPWORDS.test(w));
  const h1Text = h1s[0] ? h1s[0].text : '';
  const titleWords = new Set(words(title));
  const h1Words = new Set(words(h1Text));
  const overlap = [...titleWords].filter(w => h1Words.has(w)).length;
  seo.titleSemanticFlag = !title ? 'n/a (title missing, see titleFlag)' :
    GENERIC_TITLE.test(title.trim()) ? 'SUSPECTED: generic/placeholder title text, not page-specific' :
    (h1Text && titleWords.size && h1Words.size && overlap === 0) ?
      `SUSPECTED: shares no words with this page's <h1> ("${h1Text}") — may describe a different page` :
      'ok';

  // --- Accessibility ---
  const imgs = Array.from(document.images);
  const imgsNoAlt = imgs.filter(i => i.getBoundingClientRect().width > 4 && !i.hasAttribute('alt'))
    .map(i => (i.currentSrc || i.src).split('/').pop()).slice(0, 15);
  // duplicate ids break label/aria wiring & are invalid HTML
  const idCounts = {}; document.querySelectorAll('[id]').forEach(e => idCounts[e.id] = (idCounts[e.id] || 0) + 1);
  const dupIds = Object.entries(idCounts).filter(([, n]) => n > 1).map(([id, n]) => ({ id, count: n }));
  // aria references pointing at ids that don't exist
  const brokenAria = [];
  document.querySelectorAll('[aria-labelledby],[aria-controls],[aria-describedby]').forEach(el => {
    ['aria-labelledby', 'aria-controls', 'aria-describedby'].forEach(attr => {
      const v = el.getAttribute(attr); if (!v) return;
      v.split(/\s+/).forEach(id => { if (id && !document.getElementById(id)) brokenAria.push({ el: desc(el), attr, missingId: id }); });
    });
  });
  // form fields with no associated label / aria-label / placeholder
  const unlabeled = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea'))
    .filter(f => { const id = f.id; return !(id && document.querySelector(`label[for="${id}"]`)) &&
      !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby') && !f.closest('label'); })
    .map(f => desc(f) + (f.name ? `[name=${f.name}]` : '')).slice(0, 10);
  const positiveTabindex = Array.from(document.querySelectorAll('[tabindex]'))
    .filter(e => +e.getAttribute('tabindex') > 0).map(desc).slice(0, 8);

  /* --- Focus outline removed with no replacement ---
   *
   * `outline: none`/`outline: 0` on a `:focus`/`:focus-visible` rule is common and correct
   * when the SAME rule also sets a replacement — a box-shadow ring, a border-color change, a
   * background shift. It is a real defect when it sets nothing else: a keyboard user tabs to
   * the control and sees no change at all. This reads stylesheet rules directly rather than
   * triggering real focus, so it only sees a replacement declared in the same rule; a
   * replacement supplied by a different selector targeting the same element won't be seen —
   * report as SUSPECTED, confirm by actually tabbing to the flagged selector. */
  const focusOutlineIssues = [];
  try {
    const rules = [];
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch (e) { continue; }
      const walk = l => { for (const r of l) { if (r.style && r.selectorText) rules.push(r); else if (r.cssRules) walk(r.cssRules); } };
      walk(list);
    }
    rules.forEach(r => {
      if (!/:focus(-visible)?/.test(r.selectorText)) return;
      const outline = r.style.outline || r.style.outlineStyle || r.style.outlineWidth;
      if (!outline || !/^(none|0)/.test(outline.trim())) return;
      const hasReplacement = ['boxShadow', 'borderColor', 'borderWidth', 'backgroundColor', 'background']
        .some(p => r.style[p] && r.style[p].trim());
      if (hasReplacement) return;
      focusOutlineIssues.push({ selector: r.selectorText, confidence: 'suspected',
        hint: 'removes the focus outline with no box-shadow/border/background replacement in the same rule — ' +
              'a keyboard user tabbing here sees no visible change. Verify by tabbing to it; a replacement ' +
              'in a different rule targeting the same element would not be seen by this check.' });
    });
  } catch (e) {}

  /* --- Custom widgets built from bare divs ---
   *
   * Everything above checks properties of elements that already declare what they are. The
   * gap is the widget assembled out of divs: a tab strip, an accordion, a carousel. It looks
   * and clicks correctly, and to a screen reader or a keyboard it does not exist — no role,
   * no state, no arrow keys, often not even focusable. A who-we-help tab strip of three plain
   * divs passed every existing a11y check on a page where it is the primary way to read the
   * section.
   *
   * Detect by behaviour-shape, not by class name: a group of 2+ sibling elements that share a
   * class, are clickable, and toggle sibling panels. Then ask what's missing. Webflow's own
   * Tabs/Dropdown components DO emit roles, so a hand-rolled widget is the interesting case.
   * Reported as SUSPECTED where we infer intent from naming, MEASURED for the attribute facts. */
  const WIDGET_HINT = /(^|[-_])(tab|tabs|tablist|accordion|faq|toggle|slide|carousel|stepper|filter|pill)([-_s]|$)/i;
  const widgetIssues = [];
  const groupsSeen = new Set();
  Array.from(document.querySelectorAll('body *')).forEach(parent => {
    if (widgetIssues.length >= 8) return;
    const kids = Array.from(parent.children).filter(k => k.getBoundingClientRect().width > 8);
    if (kids.length < 2 || kids.length > 12) return;
    /* Match on the FIRST class token, not the whole attribute. The active item in a tab strip
     * carries an extra class — `is-active`, a Webflow `w-variant-…`, an `w--current` — so
     * comparing full class strings rejected exactly the widget worth finding: a three-tab strip
     * where one tab differed only by its selected-state class. */
    const tok = el => (cls(el).trim().split(/\s+/)[0] || '');
    const first = tok(kids[0]); if (!first) return;
    if (!kids.every(k => tok(k) === first)) return;                  // a uniform set of siblings
    if (!WIDGET_HINT.test(first) && !WIDGET_HINT.test(cls(parent))) return;
    const sig = cls(parent) + '>' + first; if (groupsSeen.has(sig)) return; groupsSeen.add(sig);
    const clickable = kids.filter(k => getComputedStyle(k).cursor === 'pointer' ||
      k.hasAttribute('onclick') || k.hasAttribute('data-w-id') ||
      /^(button|a)$/i.test(k.tagName) || k.querySelector('button,a')).length;
    if (clickable < kids.length) return;                             // not an interactive set
    const nativeCtrl = kids.filter(k => /^(button|a)$/i.test(k.tagName) ||
      k.querySelector('button,a[href]')).length;
    const roled = kids.filter(k => k.getAttribute('role') ||
      (k.closest('[role]') && k.closest('[role]') !== document.body)).length;
    const stated = kids.filter(k => k.hasAttribute('aria-selected') ||
      k.hasAttribute('aria-expanded') || k.hasAttribute('aria-current')).length;
    const focusable = kids.filter(k => /^(button|a)$/i.test(k.tagName) ||
      k.hasAttribute('tabindex') || k.querySelector('button,a[href],[tabindex]')).length;
    const controls = kids.filter(k => k.hasAttribute('aria-controls')).length;
    const missing = [];
    if (!roled) missing.push('no role on any item (expected role="tab"/"button" — or use Webflow\'s Tabs component, which emits them)');
    if (!stated) missing.push('no aria-selected/aria-expanded — the active item is conveyed by styling only');
    if (!focusable) missing.push('not keyboard focusable — unreachable without a mouse');
    if (!controls && !roled) missing.push('no aria-controls linking each item to the panel it opens');
    /* Require a STRUCTURAL failure — no role, or no way to reach it by keyboard. A carousel whose
     * slides are focusable links with roles and merely lack aria-selected is adequately built,
     * and reporting it alone is the kind of half-finding that costs a report its credibility. */
    if (roled && focusable) return;
    if (!missing.length) return;
    const parentRole = parent.getAttribute('role');
    widgetIssues.push({
      widget: desc(parent), items: kids.length, itemClass: first.split(/\s+/)[0],
      parentRole: parentRole || '(none)',
      itemsFocusable: focusable, itemsWithRole: roled, itemsWithState: stated,
      builtFromNativeControls: nativeCtrl,
      missing,
      confidence: focusable === 0 ? 'measured' : 'suspected',
      severity: focusable === 0 ? 'high' : 'medium',
      hint: 'custom widget assembled from generic elements: works with a mouse, invisible to ' +
            'screen readers and unusable by keyboard. Verify by tabbing to it.'
    });
  });

  /* --- Heading/paragraph semantic mismatch ---
   *
   * A screen reader's heading list and a browser's outline view both read tag names, not
   * pixels. A short, large, bold line of text sitting where a section title belongs but
   * marked up as a <p>/<div>/<span> is invisible to both — it looks exactly like a heading
   * and functions like body text. The inverse also happens: an <h2> restyled down to
   * body size still announces "heading, level 2" with nothing to show for it
   * visually. Both are SUSPECTED findings — confirm by eye before reporting as fact, since a
   * short bold pull-quote or a label chip can trip the same size/weight heuristic. */
  const bodyFs = parseFloat(getComputedStyle(document.body).fontSize) || 16;
  const looksLikeHeadingButIsnt = [];
  Array.from(document.querySelectorAll('p,div,span,a')).forEach(el => {
    if (looksLikeHeadingButIsnt.length >= 10) return;
    if (el.querySelector('h1,h2,h3,h4,h5,h6')) return;               // heading lives inside it already
    if (!visible(el)) return;
    const ownText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (!ownText) return;                                            // text belongs to a child element, not this one
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    if (!text || text.split(' ').length > 14 || text.length > 90) return;   // headings read short
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const bigEnough = fs >= bodyFs * 1.5 || (fs >= bodyFs * 1.2 && weight >= 600);
    if (!bigEnough) return;
    looksLikeHeadingButIsnt.push({ el: desc(el), text: text.slice(0, 70), fontSize: fs, fontWeight: weight,
      confidence: 'suspected',
      hint: 'renders at heading size/weight but is not an <h1>-<h6> — absent from screen-reader ' +
            'heading navigation and page-outline tools; verify by eye, then retag' });
  });
  const taggedHeadingButFlat = headingEls.map(h => {
    const cs = getComputedStyle(h); return { h, fs: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400 };
  }).filter(h => h.fs <= bodyFs * 1.05 && h.weight < 600)
    .map(h => ({ el: desc(h.h), text: h.h.textContent.trim().replace(/\s+/g, ' ').slice(0, 70),
      fontSize: h.fs, fontWeight: h.weight, confidence: 'suspected',
      hint: 'tagged as a heading but computes at body-text size/weight — announced as a heading ' +
            'with no visual hierarchy for sighted users; verify by eye, then restyle or retag' }))
    .slice(0, 10);

  // --- Rendering health ---
  // web fonts declared but not actually loaded → users see a fallback
  const usedFamilies = new Set();
  Array.from(document.querySelectorAll('body *')).slice(0, 4000).forEach(el => {
    const ff = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (ff && !/^(serif|sans-serif|monospace|system-ui|-apple-system|inherit|ui-)/.test(ff)) usedFamilies.add(ff);
  });
  const fontsNotLoaded = [];
  usedFamilies.forEach(f => { try { if (!document.fonts.check(`16px "${f}"`)) fontsNotLoaded.push(f); } catch (e) {} });
  // very small body text (< 12px) hurts legibility
  const tiny = new Set();
  Array.from(document.querySelectorAll('p,li,span,a,div')).forEach(el => {
    if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return;
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs && fs < 12) tiny.add(fs + 'px: ' + desc(el)); });
  // images missing width/height attrs → layout shift (CLS)
  const noDims = imgs.filter(i => i.getBoundingClientRect().width > 20 &&
    !(i.getAttribute('width') && i.getAttribute('height')) && getComputedStyle(i).aspectRatio === 'auto')
    .map(i => (i.currentSrc || i.src).split('/').pop()).slice(0, 12);
  // oversized images (serving far more pixels than displayed)
  const dpr = window.devicePixelRatio || 1;
  const oversized = imgs.map(i => { const r = i.getBoundingClientRect(); if (r.width < 10 || !i.naturalWidth) return null;
    const factor = i.naturalWidth / (r.width * dpr); return factor > 2.5 ?
      { img: (i.currentSrc || i.src).split('/').pop(), natural: i.naturalWidth, displayed: Math.round(r.width), factor: +factor.toFixed(1) } : null;
  }).filter(Boolean).slice(0, 10);

  // --- Structured data (JSON-LD): present & valid (Semrush "structured data invalid") ---
  const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const ldIssues = [];
  ld.forEach((s, i) => { try { const j = JSON.parse(s.textContent);
    const types = [].concat(j['@graph'] || j).map(x => x && x['@type']).filter(Boolean);
    if (!types.length) ldIssues.push(`block ${i + 1}: parsed but no @type`);
  } catch (e) { ldIssues.push(`block ${i + 1}: invalid JSON — ${e.message.slice(0, 40)}`); } });
  const structuredData = { blocks: ld.length, issues: ldIssues,
    flag: ld.length ? (ldIssues.length ? 'INVALID' : 'ok') : 'none found' };

  /* --- AEO (answer-engine optimization) ---
   *
   * Answer engines (ChatGPT, Perplexity, Google AI Overviews, Gemini) lift short,
   * self-contained answers and structured Q&A/FAQ data — they don't read marketing prose
   * looking for the point. Three checks: does a question-phrased heading get a short direct
   * answer right after it (not three paragraphs of throat-clearing first); is there FAQ/
   * HowTo/Article structured data specifically, not just any JSON-LD block; and has the site
   * published an llms.txt (an emerging, optional convention, so its absence is informational,
   * not a defect). */
  const qaHeadings = [];
  headingEls.forEach(h => {
    const text = h.textContent.trim().replace(/\s+/g, ' ');
    if (!/\?\s*$/.test(text)) return;
    let node = h.nextElementSibling, answer = null, hops = 0;
    while (node && hops < 4 && !answer) {
      const t = (node.textContent || '').trim();
      if (t) answer = { text: t.replace(/\s+/g, ' ').slice(0, 140), words: t.split(/\s+/).length };
      node = node.nextElementSibling; hops++;
    }
    qaHeadings.push({
      heading: text.slice(0, 90),
      answerWordCount: answer ? answer.words : 0,
      flag: !answer ? 'question heading has no answer text directly after it' :
        answer.words > 60 ? `${answer.words}-word run-up before the answer — lifting engines favor a ` +
          'short direct answer in the first sentence, with detail after' : 'ok'
    });
  });
  const ldTypes = new Set();
  ld.forEach(s => { try { const j = JSON.parse(s.textContent);
    [].concat(j['@graph'] || j).forEach(x => x && x['@type'] && [].concat(x['@type']).forEach(t => ldTypes.add(t))); } catch (e) {} });
  const answerEngineTypes = ['FAQPage', 'HowTo', 'Article', 'NewsArticle', 'BlogPosting', 'QAPage'];
  const hasAnswerEngineSchema = answerEngineTypes.filter(t => ldTypes.has(t));
  let llmsTxt = 'not checked';
  try {
    const r = await fetch('/llms.txt', { method: 'GET' });
    llmsTxt = r.ok ? 'present' : `absent (HTTP ${r.status})`;
  } catch (e) { llmsTxt = 'absent (fetch failed — ' + e.message.slice(0, 40) + ')'; }
  const aeo = {
    questionHeadings: qaHeadings,
    structuredDataTypesFound: [...ldTypes],
    answerEngineSchemaPresent: hasAnswerEngineSchema.length ? hasAnswerEngineSchema : 'none of FAQPage/HowTo/Article/QAPage found',
    llmsTxt,
    note: 'llms.txt is an emerging, optional convention — treat its absence as informational, not a defect'
  };

  // --- Forms: email fields not using type=email (weak validation — "invalid email accepted") ---
  const emailInputs = Array.from(document.querySelectorAll('input'))
    .filter(i => /mail/i.test((i.name || '') + (i.id || '') + (i.placeholder || '')) && i.type !== 'email' && i.type !== 'hidden')
    .map(i => desc(i) + ' (type=' + i.type + ')').slice(0, 6);

  return {
    seo,
    headings,
    aeo,
    structuredData,
    accessibility: { imagesMissingAlt: imgsNoAlt, duplicateIds: dupIds, brokenAriaRefs: brokenAria.slice(0, 10),
      unlabeledFormFields: unlabeled, emailFieldsNotTypeEmail: emailInputs, positiveTabindex,
      customWidgetsWithoutSemantics: widgetIssues, focusOutlineRemovedNoReplacement: focusOutlineIssues,
      semanticMismatches: { looksLikeHeadingButIsnt, taggedHeadingButFlat } },
    rendering: { webFontsNotLoaded: fontsNotLoaded, tinyText: [...tiny].slice(0, 10),
      imagesMissingDimensions: noDims, oversizedImages: oversized }
  };
})();
