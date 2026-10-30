import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessageBody } from '../client/ui/body.js';
import { safeImageURL, safeLinkURL, resolveImageSource } from '../client/ui/image-source.js';
const image = name => `![${name}](https://example.com/${name}.png)`;
const kinds = blocks => blocks.map(block => block.images ? block.images.map(i => i.alt).join('/') : block.tag);

test('images stay between prose, including inside emphasis and links', () => {
  const model = parseMessageBody(`Before **bold ${image('A')} after** ${image('B')} ending`);
  assert.deepEqual(kinds(model), ['p', 'A', 'p', 'B', 'p']);
  assert.equal(model[2].units[0].parents[0].tag, 'strong');
  const linked = parseMessageBody(`[${image('A')}](https://example.com/original)`);
  assert.equal(linked[0].images[0].link, 'https://example.com/original');
});
test('consecutive images join across whitespace, not captions or structural boundaries', () => {
  assert.deepEqual(kinds(parseMessageBody(`${image('A')}\n\n${image('B')}\n\nCaption\n\n${image('C')}`)), ['A/B', 'p', 'C']);
  const nested = parseMessageBody(`- ${image('A')}\n- ${image('B')}\n\n> ${image('C')}\n\n${image('D')}`);
  assert.deepEqual(kinds(nested), ['ul', 'blockquote', 'D']);
  assert.deepEqual(nested[0].children.map(li => kinds(li.children)), [['A'], ['B']]);
});
test('one, four, ten, thirty and repeated references preserve every occurrence', () => {
  for (const count of [1, 2, 3, 4, 5, 10, 30]) {
    const model = parseMessageBody(Array(count).fill(image('same')).join('\n\n'));
    assert.equal(model.length, 1);
    assert.equal(model[0].images.length, count);
  }
});
test('code stays literal and headings/tables remain structural boundaries', () => {
  const code = parseMessageBody('```md\n' + image('A') + '\n```\n\n`' + image('B') + '`');
  assert.deepEqual(kinds(code), ['pre', 'p']);
  assert.equal(code[1].units[0].code, true);
  const table = parseMessageBody(`|Image|Text|\n|---|---|\n|${image('A')}|hello|`);
  assert.equal(table[0].tag, 'table');
  assert.deepEqual(kinds(table[0].children[1].children[0].children[0].children), ['A']);
});
test('unsafe URLs are refused, adapter results are checked, cancellation wins', async () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'file:///x', '//example.com/x', 'https://user:pass@example.com/x']) assert.equal(safeImageURL(value), null);
  assert.equal(safeLinkURL('javascript:alert(1)'), null);
  const hash = 'a'.repeat(43) + '=';
  assert.equal(await resolveImageSource({ src: hash }, async () => 'javascript:bad'), null);
  const controller = new AbortController();
  assert.equal(await resolveImageSource({ src: hash }, async () => { controller.abort(); return 'data:image/png;base64,YQ=='; }, controller.signal), null);
});
