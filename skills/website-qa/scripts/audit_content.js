/*
 * audit_content.js — content & link defects that ship to production, no Figma needed.
 *
 * The stuff clients actually notice: lorem left in a live section, a "Service Title
 * Here" placeholder, buttons that link to "#", links pointing at the staging
 * webflow.io domain, empty headings. Paste into a browser javascript_exec call.
 */
(() => {
  const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
  const desc = el => el.tagName.toLowerCase() +
    (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 2).join('.') : '');
  const visible = el => { const c = getComputedStyle(el); const r = el.getBoundingClientRect();
    return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity !== 0 && r.width > 0 && r.height > 0; };

  // 1) PLACEHOLDER / LOREM text visible in the live DOM
  const PLACEHOLDER = /lorem ipsum|[a-z]orem ipsum|dolor sit amet|consectetur adipiscing|title goes here|text goes here|service title here|your (title|text) here|placeholder|lipsum|\bTBD\b|\bTODO\b|xxxxx|sample (text|copy)/i;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seenP = new Set(), placeholders = []; let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.trim(); if (t.length < 4 || !PLACEHOLDER.test(t)) continue;
    const el = node.parentElement; if (!el) continue;
    if (/^(style|script|noscript)$/i.test(el.tagName)) continue;      // skip CSS (::placeholder) / JS text
    // report hidden placeholders too — leftover lorem in a display:none panel still ships
    const k = desc(el) + '|' + t.slice(0, 20); if (seenP.has(k)) continue; seenP.add(k);
    placeholders.push({ el: desc(el), text: t.replace(/\s+/g, ' ').slice(0, 60), visibleNow: visible(el) });
  }

  /* 1b) WEBFLOW'S UNTOUCHED DEFAULT RICH-TEXT BLOCK
   *
   * A dropped Rich Text element arrives pre-filled with a demo document, and because every
   * line of it is plausible-looking prose the generic lorem regex above only catches the one
   * paragraph. The rest — "Heading 1…Heading 6", "Block quote", "Ordered list / Item 1",
   * "Unordered list / Item A", "Text link Bold text Emphasis Superscript Subscript" — sails
   * through, and it shipped on a live client service page.
   *
   * The fingerprint is unmistakable and worth matching exactly rather than fuzzily: the
   * sequential Heading 1..6 run, the Item A/B/C list, and the giveaway outbound link to
   * university.webflow.com/lesson/add-and-nest-text-link. Two or more marks = certain.
   *
   * Bonus finding for free: the same pass reads the computed type of the nested headings.
   * Rich-text h1–h6 inherit body styles unless someone styles them explicitly, so a section
   * can be "finished" and still have no heading hierarchy at all. */
  const RT_MARKS = [
    [/heading\s*1\s*heading\s*2|heading\s*1[\s\S]{0,40}heading\s*6/i, 'sequential "Heading 1…Heading 6" run'],
    [/\bitem\s*a\b[\s\S]{0,40}\bitem\s*b\b/i, '"Item A / Item B" demo list'],
    [/ordered list[\s\S]{0,40}item\s*1/i, '"Ordered list / Item 1" demo list'],
    [/block\s*quote/i, '"Block quote" demo text'],
    [/superscript[\s\S]{0,20}subscript/i, '"Superscript / Subscript" demo run'],
    [/emphasis[\s\S]{0,20}(superscript|bold text)/i, '"Bold text / Emphasis" demo run']
  ];
  const defaultRichText = Array.from(document.querySelectorAll('.w-richtext, [class*="rich-text"], [class*="richtext"]'))
    .map(rt => {
      const t = (rt.innerText || '').replace(/\s+/g, ' ');
      if (t.length < 20) return null;
      const marks = RT_MARKS.filter(([re]) => re.test(t)).map(([, label]) => label);
      const demoLink = Array.from(rt.querySelectorAll('a[href]'))
        .map(a => a.getAttribute('href'))
        .find(h => /university\.webflow\.com\/lesson\/(add-and-nest-text-link|rich-text)/i.test(h || ''));
      if (demoLink) marks.push('live outbound link to ' + demoLink);
      if (marks.length < 2) return null;
      // the free extra: is the nested heading hierarchy styled at all?
      const hs = Array.from(rt.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => {
        const c = getComputedStyle(h);
        return { tag: h.tagName, fontSize: c.fontSize, fontWeight: c.fontWeight,
          fontFamily: c.fontFamily.split(',')[0].replace(/["']/g, ''),
          display: c.display, marginTop: c.marginTop };
      });
      const sizes = new Set(hs.map(h => h.fontSize));
      const body = getComputedStyle(rt).fontSize;
      return {
        el: desc(rt), visibleNow: visible(rt),
        marks, confidence: 'measured',
        severity: 'critical',
        hint: 'this is Webflow\'s stock Rich Text demo content — it was dropped in and never ' +
              'edited. Replace the whole block.',
        nestedHeadings: hs.length ? {
          count: hs.length, distinctSizes: [...sizes],
          allSameSizeAsBody: sizes.size === 1 && [...sizes][0] === body,
          inlineDisplay: hs.filter(h => h.display === 'inline').length,
          noTopMargin: hs.filter(h => h.marginTop === '0px').length,
          hint: (sizes.size === 1 && [...sizes][0] === body)
            ? 'every nested heading computes to the body size (' + body + ') — rich-text h1–h6 ' +
              'have no styles, so this section will have NO heading hierarchy even after the ' +
              'copy is replaced. Style them on the Rich Text element\'s nested selectors.'
            : undefined
        } : null
      };
    }).filter(Boolean);

  // 2) LINKS
  const links = Array.from(document.querySelectorAll('a'));
  const host = location.host;
  const accName = el => (el.textContent.trim() || el.getAttribute('aria-label') ||
    (el.querySelector('img') && el.querySelector('img').getAttribute('alt')) || '').trim();
  const dead = [], staging = [], mixed = [], generic = {};
  const GENERIC = /^(read more|learn more|click here|here|more|link|read|view|details)$/i;
  links.forEach(a => {
    const href = a.getAttribute('href'); const txt = accName(a); const vis = visible(a);
    if (vis && (href === null || href === '' || href === '#' || href === '/#' || /^javascript:/i.test(href)))
      dead.push({ el: desc(a), text: txt.slice(0, 24) || '(no text)', href });
    if (href && /webflow\.io|\.webflow\.|localhost|127\.0\.0\.1|\.local\b|staging/i.test(href))
      staging.push({ el: desc(a), href: href.slice(0, 60) });
    if (location.protocol === 'https:' && /^http:\/\//i.test(href || ''))
      mixed.push({ el: desc(a), href: href.slice(0, 60) });
    if (vis && txt && GENERIC.test(txt)) generic[txt.toLowerCase()] = (generic[txt.toLowerCase()] || 0) + 1;
  });
  const genericAmbiguous = Object.entries(generic).filter(([, n]) => n > 1)
    .map(([t, n]) => ({ text: t, count: n }));

  // external links that don't open in a new tab ("should open in a new tab!"),
  // and _blank links missing rel=noopener (security/perf)
  const extNewTab = [], blankNoOpener = [];
  links.forEach(a => { const href = a.getAttribute('href'); if (!href || !/^https?:\/\//i.test(href)) return;
    let ext = false; try { ext = new URL(href, location.href).host !== host; } catch (e) {}
    if (ext && a.target !== '_blank') extNewTab.push({ el: desc(a), href: href.slice(0, 50) });
    if (a.target === '_blank' && !/noopener/.test(a.rel || '')) blankNoOpener.push({ el: desc(a), href: href.slice(0, 50) });
  });

  // 3) EMPTY headings / empty visible links & buttons (no accessible name)
  const emptyHeadings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .filter(h => visible(h) && !h.textContent.trim()).map(desc);
  const emptyControls = Array.from(document.querySelectorAll('a,button'))
    .filter(el => visible(el) && !accName(el) && !el.querySelector('svg,img,[class*="icon"]'))
    .map(el => desc(el)).slice(0, 10);
  // icon-only controls with no aria-label (screen-reader invisible)
  const iconOnlyNoLabel = Array.from(document.querySelectorAll('a,button'))
    .filter(el => visible(el) && !el.textContent.trim() && !el.getAttribute('aria-label') &&
      el.querySelector('svg,img,[class*="icon"]') &&
      !(el.querySelector('img') && el.querySelector('img').alt))
    .map(desc).slice(0, 10);

  return {
    placeholderText: placeholders.slice(0, 20),
    defaultRichText,
    deadLinks: dead.slice(0, 15),
    stagingLinks: staging.slice(0, 15),
    mixedContentLinks: mixed.slice(0, 10),
    genericLinkText: genericAmbiguous,
    emptyHeadings,
    emptyControls,
    iconOnlyControlsNoAriaLabel: iconOnlyNoLabel
  };
})();
