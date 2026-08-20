/*
 * audit_cascade.js — computed style disagrees with anything in the cascade that explains it.
 *
 * The bug class, from a real review that cost about eight calls to not explain: an <h1>
 * computed `display: inline`. Nothing in the author CSS set `display` on it anywhere, the
 * UA default for h1 is `block`, and the resolved matched-rules view said `block` too. The
 * page rendered the heading as inline text — headings running into the paragraph after
 * them — and every check that measured the heading agreed it was fine, because they were
 * measuring the box the browser actually made.
 *
 * The reviewer ended up setting `display: block` explicitly and saying so, rather than
 * inventing a cause. That is the right call and it should not have to be rediscovered, so
 * this names the situation instead: "computed value X, UA default Y, no author rule sets
 * this property on this element". That is a statement of fact and a pointer, not a
 * diagnosis — the cause is usually a stripped stylesheet, an unstyled rich-text wrapper,
 * or a rule dropped by a CSS syntax error earlier in the sheet.
 *
 * Deliberately narrow. It only reports properties where the disagreement has a visible
 * consequence and a known-good default (display on block-level tags, and a handful of
 * inherited type properties collapsing to the UA default on a styled element). A general
 * "computed != authored" sweep would fire on every element on every page.
 *
 * Honest about what it cannot read: cross-origin stylesheets throw on `cssRules`, and a
 * rule inside one is invisible here. Any finding is therefore SUSPECTED, never MEASURED,
 * and `unreadableStylesheets` is reported alongside so absence is never inferred from a
 * blocked read.
 */
(() => {
  /* HTML's default display for the tags where inline is a real defect rather than a
   * choice. Hardcoded rather than probed: a detached element returns nothing useful from
   * getComputedStyle, and any container used to probe one would itself affect the answer. */
  const UA_BLOCK = {
    h1: 'block', h2: 'block', h3: 'block', h4: 'block', h5: 'block', h6: 'block',
    p: 'block', div: 'block', section: 'block', article: 'block', header: 'block',
    footer: 'block', main: 'block', nav: 'block', aside: 'block', blockquote: 'block',
    figure: 'block', figcaption: 'block', ul: 'block', ol: 'block', dl: 'block',
    form: 'block', fieldset: 'block', address: 'block', hr: 'block', pre: 'block'
  };
  /* Inline is legitimate for a block tag in plenty of designs, but these values mean the
   * element has been taken out of normal block flow in a way that runs text together. */
  const SUSPECT_DISPLAY = new Set(['inline']);

  // ── read every author rule we are allowed to read ────────────────────────────
  const rules = [];
  const unreadable = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list; try { list = sheet.cssRules; }
    catch (e) { unreadable.push(sheet.href ? sheet.href.split('/').pop() : '(inline)'); continue; }
    const walk = l => { for (const r of l) {
      if (r.style && r.selectorText) rules.push(r);
      else if (r.cssRules) walk(r.cssRules);
    } };
    try { walk(list); } catch (e) { unreadable.push(sheet.href || '(inline)'); }
  }

  /* Does ANY readable author rule set `prop` on this element? Matching is done with
   * `matches()` per rule, which is slower than a selector index but correct about
   * specificity-independent "did anyone mention this property at all", which is the
   * question being asked. Malformed selectors throw and are skipped. */
  const authorSets = (el, prop) => {
    const hits = [];
    for (const r of rules) {
      let v; try { v = r.style.getPropertyValue(prop); } catch (e) { continue; }
      if (!v) continue;
      // ignore state/pseudo rules — they do not apply in the resting state being measured
      if (/:(hover|focus|active|visited|target|checked|disabled)\b/.test(r.selectorText)) continue;
      let m = false; try { m = el.matches(r.selectorText.replace(/::?[\w-]+(\([^)]*\))?/g, '')); } catch (e) { continue; }
      if (m) hits.push({ selector: r.selectorText.slice(0, 80), value: v });
    }
    return hits;
  };

  const inlineStyleSets = (el, prop) => {
    try { return !!el.style.getPropertyValue(prop); } catch (e) { return false; }
  };

  const sel = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  // ── display: a block-level tag computing as inline, with nothing that says so ──
  const displayFindings = [];
  const candidates = Object.keys(UA_BLOCK).join(',');
  for (const el of Array.from(document.querySelectorAll(candidates)).slice(0, 4000)) {
    const tag = el.tagName.toLowerCase();
    const cs = getComputedStyle(el);
    if (!SUSPECT_DISPLAY.has(cs.display)) continue;
    // an element inside a flex/grid parent is laid out by the parent, and `display:inline`
    // on a flex ITEM is blockified by the browser anyway — not this bug
    const parentDisplay = el.parentElement ? getComputedStyle(el.parentElement).display : '';
    if (/flex|grid/.test(parentDisplay)) continue;
    const authored = authorSets(el, 'display');
    const inlineAttr = inlineStyleSets(el, 'display');
    // if an author rule or the style attribute genuinely sets it, this is a decision
    if (authored.length || inlineAttr) continue;
    displayFindings.push({
      el: sel(el), tag, text: txt(el),
      computed: cs.display, uaDefault: UA_BLOCK[tag],
      authorRulesSettingDisplay: 0,
      confidence: unreadable.length ? 'suspected (some stylesheets unreadable)' : 'suspected',
      consequence: 'the element is not a block box, so it shares a line with its siblings — ' +
        'headings run into following text and vertical margins do not apply',
      hint: 'nothing in the readable cascade sets display on this element, and the UA default is ' +
        `${UA_BLOCK[tag]}. Set display explicitly on its class rather than looking for the rule that ` +
        'did this — the usual causes (a stylesheet that failed to parse, an unstyled rich-text ' +
        'wrapper, a rule dropped after a CSS syntax error) leave no trace to find.'
    });
  }

  /* ── a styled element whose type properties all sit at the UA default ─────────
   * A heading carrying a class, where font-size/line-height/weight are all exactly the
   * browser default, means the class exists but its declarations never landed. That is the
   * same root cause as above and the same eight-call investigation, so it is reported
   * together: the CSS is missing, not the markup. */
  const UA_TYPE = { h1: '32px', h2: '24px', h3: '18.72px', h4: '16px', h5: '13.28px', h6: '10.72px' };
  const unstyledHeadings = [];
  for (const el of Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 500)) {
    const tag = el.tagName.toLowerCase();
    const cs = getComputedStyle(el);
    const hasClass = typeof el.className === 'string' && el.className.trim().length > 0;
    if (!hasClass) continue;                             // an unclassed heading at defaults is just unstyled
    if (cs.fontSize !== UA_TYPE[tag]) continue;
    const authored = authorSets(el, 'font-size');
    if (authored.length) continue;                       // a rule sets it to the same value — fine
    unstyledHeadings.push({
      el: sel(el), tag, text: txt(el), fontSize: cs.fontSize, uaDefault: UA_TYPE[tag],
      confidence: unreadable.length ? 'suspected (some stylesheets unreadable)' : 'suspected',
      hint: `carries a class but computes to the browser default ${UA_TYPE[tag]}, and no readable rule ` +
        'sets font-size on it — the class exists in the markup but its declarations are not in any ' +
        'stylesheet that loaded'
    });
  }

  return {
    note: 'Every finding here is SUSPECTED by construction: it reports that nothing in the READABLE ' +
      'cascade explains a computed value. Confirm on the element before reporting, and treat the fix as ' +
      '"set it explicitly", not "find the offending rule".',
    rulesRead: rules.length,
    unreadableStylesheets: unreadable,
    unreadableWarning: unreadable.length
      ? `${unreadable.length} stylesheet(s) could not be read (cross-origin). A rule inside one is ` +
        'invisible to this check, so these findings may have an explanation this could not see.'
      : undefined,
    blockTagsComputingInline: displayFindings.slice(0, 20),
    classedHeadingsAtUaDefaultSize: unstyledHeadings.slice(0, 20)
  };
})();
