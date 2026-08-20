const originOf = value => {
  try { return new URL(value).origin; } catch { return null; }
};

export function canonicalConsoleText(text = '') {
  return String(text)
    .replace(/https?:\/\/[^\s'"`)]+/g, '<url>')
    .replace(/\b[0-9a-f]{24,}\b/gi, '<id>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function summarizeConsole(messages = [], pageUrl = '') {
  const pageOrigin = originOf(pageUrl);
  const groups = new Map();
  for (const message of messages) {
    const text = canonicalConsoleText(message.text);
    const explicitRequestUrl = String(message.text || '').match(/^Access to .*? at ['"](https?:\/\/[^'"]+)/)?.[1];
    const embeddedUrl = String(message.text || '').match(/https?:\/\/[^\s'"`)]+/)?.[0];
    // Console source location is normally the responsible origin. Only prefer an
    // embedded URL when the message explicitly names the failed request; CSP text
    // lists allowed third-party origins and must not be attributed to the first one.
    const evidenceOrigin = originOf(explicitRequestUrl) || originOf(message.sourceUrl) || originOf(embeddedUrl);
    const thirdParty = !!(pageOrigin && evidenceOrigin && evidenceOrigin !== pageOrigin);
    const key = `${message.type || 'error'}\0${thirdParty ? 'third' : 'first'}\0${text}`;
    const group = groups.get(key) || {
      type: message.type || 'error', text, sourceUrl: message.sourceUrl || null,
      thirdParty, count: 0
    };
    group.count++;
    groups.set(key, group);
  }
  const unique = [...groups.values()].sort((a, b) => b.count - a.count);
  return {
    events: messages.length,
    unique: unique.length,
    firstPartyEvents: unique.filter(group => !group.thirdParty).reduce((n, group) => n + group.count, 0),
    firstPartyUnique: unique.filter(group => !group.thirdParty).length,
    thirdPartyEvents: unique.filter(group => group.thirdParty).reduce((n, group) => n + group.count, 0),
    thirdPartyUnique: unique.filter(group => group.thirdParty).length,
    groups: unique
  };
}
