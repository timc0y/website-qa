/*
 * vocab.mjs — the ONLY place selectors live.
 *
 * Every check in this skill is generic: it looks for *shapes* (a repeated group, a
 * toggle, a panel that opens, a full-width section) rather than any one site's class
 * names. But "what counts as a toggle" is still a vocabulary, and vocabularies differ
 * between builds — a native `[aria-expanded]` control, a Tailwind `data-state`
 * component, Webflow's `.w-dropdown-toggle`, or a hand-rolled `.js-accordion`.
 * Keeping the vocabulary here means adapting the sweep
 * to a new codebase is editing one map, never touching a check.
 *
 * Extend per-run with a schema-versioned `--vocabulary=./vocabulary.json`
 * artifact. The public file is the only extension input.
 *
 * The defaults lean on three things that are true of almost every site:
 *   1. Native elements plus ARIA roles and states — `[role=tab]`,
 *      `[aria-haspopup]`, `[aria-selected]` —
 *      which are framework-independent and the most durable signal available.
 *   2. Substring class matching on the words the whole industry uses anyway
 *      (dropdown, accordion, slider, card, btn). Loose on purpose: a false candidate
 *      costs one wasted hover, a missed candidate costs a missed bug.
 *   3. Additive platform signatures such as `.w-*`; these improve coverage when
 *      present without making any platform the primary target.
 */

export const DEFAULT_VOCAB = {
  // things a person would try to hover
  hoverable: 'a,button,[role="button"],[class*="btn"],[class*="button"],[class*="card"],' +
    '[class*="tab"],[class*="nav_link"],[class*="nav-link"],[class*="link-block"],' +
    '[class*="arrow"],[class*="toggle"],[class*="tile"],[class*="item"][href]',

  // things a person would try to click open
  toggles: ['.w-nav-button', '[class*="menu-toggle"]', '[class*="menu_toggle"]', '[class*="hamburger"]',
    '.w-dropdown-toggle', '[class*="dropdown_toggle"]', '[class*="dropdown-toggle"]',
    '[aria-haspopup]', '[aria-expanded]', 'details > summary',
    '[class*="accordion"] [class*="toggle"]', '[class*="accordion"] [class*="header"]',
    '[class*="accordion"] [class*="trigger"]', '[class*="faq"] [class*="question"]',
    '.w-tab-link', '[role="tab"]'].join(','),

  // Things that read as a call to action. Clicked one at a time on a fresh page load
  // to find out whether they actually do anything — a styled <div> with no href and no
  // handler looks identical to a working button until you press it, and on one real
  // build 7 of 10 primary CTAs were exactly that. Excludes form controls: submitting a
  // client's form is a side effect QA has no business causing.
  ctaLike: '[class*="button"],[class*="btn"],[role="button"],a[class*="cta"],[class*="_cta"]',
  ctaExclude: 'form,[type="submit"],[type="button"],[class*="submit"],.w-slider-arrow-left,' +
    '.w-slider-arrow-right,[class*="slider-arrow"],[class*="slider_arrow"],[aria-label*="lose"]',

  // the panel a toggle reveals
  panels: '.w-dropdown-list,[class*="dropdown_list"],[class*="dropdown-list"],[class*="mega"],' +
    '[class*="submenu"],[class*="sub-menu"],[class*="panel"],[role="menu"],[role="dialog"]',

  // top-level navigation
  navRoots: 'nav,header,[role="navigation"],[class*="navbar"],[class*="nav_"]',
  navLinks: '.w-dropdown-toggle,[class*="dropdown_toggle"],[aria-haspopup],[class*="nav_link"],[class*="nav-link"],nav a',

  // carousels, sliders, tab groups
  carousels: '.w-slider,[class*="swiper"],[class*="carousel"],[class*="slider_"],[class*="slider-"],.w-tabs,[class*="tabs_"]',
  slides: '.w-slide,[class*="slide"],[role="tabpanel"],.w-tab-pane',
  // Deliberately NOT a bare [class*="arrow"]: that matches the decorative icon
  // wrappers nested inside a real control (.arrow-circle, .arrow-circle_svg …),
  // which measure 0 in some states and produced a phantom "4 arrows collapsed to
  // 0px" on a site whose arrows were fine. Match control-shaped things, and the
  // audit additionally drops any match nested inside another match.
  carouselControls: '.w-slider-arrow-left,.w-slider-arrow-right,.w-slider-dot,' +
    '[class*="slider-arrow"],[class*="slider_arrow"],[class*="carousel-arrow"],' +
    'button[class*="prev"],button[class*="next"],a[class*="prev"],a[class*="next"],' +
    '[aria-label*="revious"],[aria-label*="ext slide"],[data-slider-nav]',
  activeState: '.w-slider-dot.w-active,.w-tab-link.w--current,[class*="active"],[aria-selected="true"],[aria-current]',

  // page structure
  sections: 'section,[class*="section"],main > div,[data-section]',
  stickyCandidates: 'header,nav,[class*="navbar"],[class*="header"]',

  // elements wired for scroll-reveal motion
  revealCandidates: '[data-w-id],[class*="reveal"],[class*="fade"],[data-animate],[data-aos],[class*="animate"]',

  // never touch these — third-party furniture that isn't the site's own UI
  ignore: '.marker-app,#marker-app,[class*="intercom"],[id*="hubspot"],[class*="chat-widget"],' +
    '[id*="onetrust"],[class*="cookie"],[class*="usercentrics"],iframe',

  // dev/staging furniture that must not reach a client review
  devFurniture: '[class*="marker-app"],#marker-app,[id*="devtools"],[class*="dev-mode"],[class*="debug"],' +
    '[class*="grid-overlay"],.w-editor-bem-EditSiteButton,[data-wf-editor],[class*="staging-banner"]',
  devHosts: 'localhost|127\\.0\\.0\\.1|:5500|ngrok|\\.local/|file://'
};

export const loadVocab = (artifact) => {
  if (artifact === null || artifact === undefined) return DEFAULT_VOCAB;
  if (artifact.schemaVersion !== 1 || !artifact.selectors || typeof artifact.selectors !== 'object' || Array.isArray(artifact.selectors)) {
    throw new Error('vocabulary must be a schemaVersion 1 artifact with a selectors object');
  }
  for (const [key, value] of Object.entries(artifact.selectors)) {
    if (typeof value !== 'string') throw new Error(`vocabulary selectors.${key} must be a string`);
  }
  return { ...DEFAULT_VOCAB, ...artifact.selectors };
};
