/*
 * audit_a11y_seo.js — accessibility, SEO/meta, and rendering-health checks.
 * No Figma needed. Paste into a browser javascript_exec call.
 */
(() => {
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

  // --- Forms: email fields not using type=email (weak validation — "invalid email accepted") ---
  const emailInputs = Array.from(document.querySelectorAll('input'))
    .filter(i => /mail/i.test((i.name || '') + (i.id || '') + (i.placeholder || '')) && i.type !== 'email' && i.type !== 'hidden')
    .map(i => desc(i) + ' (type=' + i.type + ')').slice(0, 6);

  return {
    seo,
    structuredData,
    accessibility: { imagesMissingAlt: imgsNoAlt, duplicateIds: dupIds, brokenAriaRefs: brokenAria.slice(0, 10),
      unlabeledFormFields: unlabeled, emailFieldsNotTypeEmail: emailInputs, positiveTabindex,
      customWidgetsWithoutSemantics: widgetIssues },
    rendering: { webFontsNotLoaded: fontsNotLoaded, tinyText: [...tiny].slice(0, 10),
      imagesMissingDimensions: noDims, oversizedImages: oversized }
  };
})();
