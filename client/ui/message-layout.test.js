import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageMain } from './message-layout.js';

class FakeElement {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; }
  append(...nodes) { this.children.push(...nodes); }
}
test('shared message layout keeps avatar, author and body order', () => {
  const doc = { createElement: tag => new FakeElement(tag) };
  const avatarLink = new FakeElement('a');
  const authorNode = new FakeElement('a');
  const bodyNode = new FakeElement('div');
  const main = createMessageMain({ avatarLink, authorNode, bodyNode, document: doc });
  assert.equal(main.className, 'message-main');
  assert.equal(main.children[0], avatarLink);
  const stack = main.children[1];
  assert.equal(stack.className, 'message-stack');
  assert.deepEqual(stack.children, [authorNode, bodyNode]);
});
test('layout supports edits without avatar or body', () => {
  const doc = { createElement: tag => new FakeElement(tag) };
  const summary = new FakeElement('span');
  const main = createMessageMain({ authorNode: summary, document: doc });
  assert.deepEqual(main.children[0].children, [summary]);
});
test('layout does not need a global document when host supplies one', () => {
  const doc = { createElement: tag => new FakeElement(tag) };
  assert.equal(createMessageMain({ document: doc }).className, 'message-main');
});
