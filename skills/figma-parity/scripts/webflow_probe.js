/* Optional Webflow adapter for figma-parity. Load only for a Webflow target. */

(() => {
  window.forceWebflowPanel = selector => {
    const panel = document.querySelector(selector);
    if (!panel) return { shown: false, reason: `not found: ${selector}` };
    const previous = {
      display: panel.style.display,
      opacity: panel.style.opacity,
      visibility: panel.style.visibility,
      pointerEvents: panel.style.pointerEvents
    };
    Object.assign(panel.style, { display: 'block', opacity: '1', visibility: 'visible', pointerEvents: 'auto' });
    const rect = panel.getBoundingClientRect();
    return {
      shown: true,
      selector,
      previous,
      geometry: { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top) },
      limitation: 'Layout-only evidence: forcing visibility does not prove the Webflow IX2 interaction.'
    };
  };
  return 'ready: forceWebflowPanel(selector)';
})();
