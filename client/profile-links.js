// Data-only helpers: safe to import without booting Wiredove or its storage.
export function normalizeProfileLinks(value, { strict = false } = {}) {
  if (!Array.isArray(value)) {
    if (strict) throw new Error('Links must be a list.');
    return [];
  }
  return value.flatMap((entry, index) => {
    try {
      if (!entry || typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url.trim())) throw new Error();
      const url = new URL(entry.url.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
      const label = typeof entry.label === 'string' ? entry.label.trim() : '';
      return [{ label: label || url.hostname, url: url.href }];
    } catch {
      if (strict) throw new Error(`Link ${index + 1}: enter a full http:// or https:// URL without a username or password.`);
      return [];
    }
  });
}

// Input must already be scoped to one author's verified messages.
// A missing field preserves history; an explicit empty list clears it.
export function profileLinksFromHistory(entries) {
  const sorted = [...entries].sort((a, b) => Number(b.ts || b.timestamp || 0) - Number(a.ts || a.timestamp || 0));
  for (const entry of sorted) {
    const yaml = entry.yaml || entry.parsed || {};
    if (yaml.reply || yaml.replyHash || yaml.replyto || yaml.replyTo) continue;
    if (Object.hasOwn(yaml, 'links') && Array.isArray(yaml.links)) {
      return normalizeProfileLinks(yaml.links);
    }
  }
  return null;
}

const services = {
  'github.com': 'github', 'x.com': 'x', 'twitter.com': 'x',
  'bsky.app': 'bluesky', 'bsky.social': 'bluesky',
  'mastodon.social': 'mastodon', 'mastodon.online': 'mastodon',
  'youtube.com': 'youtube', 'youtu.be': 'youtube',
  'instagram.com': 'instagram', 'twitch.tv': 'twitch', 'reddit.com': 'reddit',
};

export function profileLinkService(url) {
  try { return services[new URL(url).hostname.toLowerCase().replace(/^www\./, '')] || 'website'; }
  catch { return 'website'; }
}
