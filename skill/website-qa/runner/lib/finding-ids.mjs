import { createHash } from 'node:crypto';

const FINDING_ARRAYS = new Set([
  'findings', 'errors', 'warnings', 'offenders', 'missing', 'outliers',
  'regressions', 'dead', 'failed', 'hazards', 'issues', 'violations',
  'collapsedElements', 'unintendedWrapping', 'clippedText', 'lowContrast',
  'imageIssues', 'emptyMediaSlots', 'missingArrows', 'collapsedArrows',
  'nearMissWraps', 'orphanHeadings', 'wrappedGroups', 'missingGaps',
  'unlinkedPhones', 'unlinkedEmails', 'falseAffordance', 'missingAffordance',
  'unselectableText', 'emptyLists', 'emptyBindings', 'upscaledImages',
  'hitTestBlocked', 'aspectRatioNotHonoured', 'inputsCausingIosZoom',
  'mediaClippedByParentRadius', 'oversized', 'noIntrinsicSize',
  'aspectMismatch', 'duplicateListItems', 'duplicateIcons', 'widgets',
  'devScripts', 'strayFixedBoxes', 'navContentParity', 'sectionsWithNoMotion'
]);

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).filter(key => !['findingId', 'findingKind'].includes(key)).sort().map(key => [key, canonical(value[key])]));
};

const slug = value => String(value).replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const firstIdentityValue = (item, keys) => {
  for (const key of keys) {
    const value = item?.[key];
    if (['string', 'number', 'boolean'].includes(typeof value) && String(value).trim()) return String(value).trim();
  }
  return null;
};

const semanticIdentity = (item) => ({
  target: firstIdentityValue(item, ['el', 'selector', 'targetElementId', 'id', 'href', 'url', 'field', 'path', 'name', 'component', 'control']),
  subtype: firstIdentityValue(item, ['code', 'kind', 'type', 'issue', 'hazard', 'flag', 'metric', 'severity'])
});

export function annotateFindings(report) {
  const index = [];
  const visit = (value, path = [], scope = {}) => {
    if (!value || typeof value !== 'object') return;
    const nextScope = {
      url: typeof value.url === 'string' ? value.url : scope.url,
      breakpoint: Number.isInteger(value.breakpoint) ? value.breakpoint : scope.breakpoint
    };
    if (Array.isArray(value)) {
      const key = path.at(-1);
      for (const [position, item] of value.entries()) {
        if (FINDING_ARRAYS.has(key) && item && typeof item === 'object' && !Array.isArray(item)) {
          const kind = slug(key);
          const identity = semanticIdentity(item);
          const semantic = { kind, scope: nextScope, identity, finding: canonical(item) };
          const findingId = `wqa:${kind}:${createHash('sha256').update(JSON.stringify(semantic)).digest('hex').slice(0, 20)}`;
          item.findingId = findingId;
          item.findingKind = kind;
          index.push({ findingId, kind, url: nextScope.url || null, breakpoint: nextScope.breakpoint || null, path: `/${[...path, position].join('/')}` });
        }
        visit(item, [...path, position], nextScope);
      }
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      const breakpoint = /^\d+$/.test(key) && path.at(-1) === 'byBreakpoint' ? Number(key) : nextScope.breakpoint;
      visit(item, [...path, key], { ...nextScope, breakpoint });
    }
  };
  visit(report);
  return index;
}
