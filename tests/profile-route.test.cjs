// Run: node --experimental-vm-modules --test tests/profile-route.test.cjs
// Exercise the real router with an offline feed and delayed profile metadata.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const vm = require('node:vm');

async function fixture(query, src = 'ev') {
  const elements = new Map();
  const node = (tag, attrs = {}) => ({
    ...attrs, dataset: {}, children: [], parentNode: null,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) elements.set(child.id, child);
      return child;
    },
    prepend(child) { child.parentNode = this; this.children.unshift(child); },
    replaceChildren() { this.children = []; },
    remove() {
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }
  });
  const window = { location: { hash: '#' + src }, scrollY: 0 };
  const header = node('div', { classList: 'profile-header' });
  let resolveHeader;
  let headerStarted;
  const started = new Promise(resolve => { headerStarted = resolve; });
  const pendingHeader = new Promise(resolve => { resolveHeader = resolve; });
  const deps = {
    apds: { pubkey: async () => null }, h: node,
    render: { buildReplyIndex: async () => {} },
    adder(messages, src, panel) {
      // Include a loading row even when the feed is empty: the sentinel is
      // always present and must never appear above the profile.
      for (const message of messages) panel.appendChild(node('div', { classList: 'premessage' }));
      panel.appendChild(node('div', { classList: 'scroll-sentinel' }));
    },
    buildProfileHeader: async () => { headerStarted(); return pendingHeader; },
    FeedStore: class {},
    FeedOrchestrator: class {
      async startAlias() { return { query, primaryKey: 'a'.repeat(44) }; }
      async startAuthor() { return { log: query }; }
      stop() {}
    },
    perfStart() {}, perfEnd() {}, noteInterest: async () => {},
    isBlockedAuthor: async () => false, send: async () => {}
  };
  const context = vm.createContext({
    window, document: { body: node('body'), getElementById: id => elements.get(id) },
    AbortController, setTimeout, console
  });
  const source = await readFile(require.resolve('../route.js'), 'utf8');
  const router = new vm.SourceTextModule(source, { context });
  await router.link(specifier => {
    const names = [...source.matchAll(/import \{([^}]+)\} from '([^']+)'/g)]
      .filter(match => match[2] === specifier)
      .flatMap(match => match[1].split(',').map(name => name.trim()));
    return new vm.SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, deps[name] || (() => {}));
    }, { context });
  });
  await router.evaluate();
  const run = router.namespace.route();
  await started;
  const panel = elements.get('scroller').children[0];
  return { window, panel, header, finish: async () => { resolveHeader(header); await run; } };
}

for (const query of [[], [{ text: 'post' }], null]) {
  test(`alias header precedes feed placeholders (${query?.length ?? 'missing'} posts)`, async () => {
    const f = await fixture(query);
    await f.finish();
    assert.equal(f.panel.children[0], f.header);
    assert.equal(f.panel.children.at(-1).classList, 'scroll-sentinel');
  });
}

test('late alias metadata cannot insert a header after navigation away', async () => {
  const f = await fixture([]);
  f.window.location.hash = '#other';
  await f.finish();
  assert.equal(f.panel.children.includes(f.header), false);
});

test('public-key profiles also keep the header before feed placeholders', async () => {
  const f = await fixture([{ text: 'post' }], 'a'.repeat(44));
  await f.finish();
  assert.equal(f.panel.children[0], f.header);
});
