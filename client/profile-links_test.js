import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfileLinks, profileLinksFromHistory, profileLinkService } from './profile-links.js';

const old = [{ label: 'Home', url: 'https://example.com/' }];
test('latest explicit list wins across website and embed message shapes', () => {
  assert.equal(profileLinksFromHistory([{ ts: 9, yaml: { bio: 'Legacy' } }]), null);
  assert.deepEqual(profileLinksFromHistory([
    { ts: 1, yaml: { links: old } }, { ts: 2, yaml: { name: 'New name' } },
  ]), old);
  assert.deepEqual(profileLinksFromHistory([
    { timestamp: 1, parsed: { links: old } },
    { timestamp: 3, parsed: { links: [] } },
    { timestamp: 4, parsed: { reply: 'post', links: old } },
  ]), []);
  assert.deepEqual(profileLinksFromHistory([
    { ts: 3, yaml: { links: null } }, { ts: 1, yaml: { links: old } },
  ]), old);
});

test('remote malformed entries are omitted while editor rejects unsafe URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/relative', 'ftp://example.com', 'https://user:password@example.com']) {
    assert.deepEqual(normalizeProfileLinks([{ url }]), []);
    assert.throws(() => normalizeProfileLinks([{ url }], { strict: true }), /Link 1/);
  }
  assert.deepEqual(normalizeProfileLinks([null, {}, { url: 12 }, ...old]), old);
  assert.deepEqual(normalizeProfileLinks([{ label: '  ', url: ' https://example.com ' }]), [{ label: 'example.com', url: 'https://example.com/' }]);
});

test('order and custom labels survive; branding matches exact hosts only', () => {
  const links = [{ label: '<img src=x onerror=alert(1)>', url: 'https://github.com/evbogue' }, ...old];
  assert.deepEqual(normalizeProfileLinks(links), links);
  for (const [url, service] of [
    ['https://www.github.com/evbogue', 'github'], ['https://twitter.com/evbogue', 'x'],
    ['https://bsky.app/profile/example.com', 'bluesky'],
    ['https://github.com.example.org', 'website'], ['https://example.com/github.com', 'website'],
  ]) assert.equal(profileLinkService(url), service);
});
