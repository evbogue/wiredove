import test from 'node:test';
import assert from 'node:assert/strict';
import { attachEditHistory, collectEdits, editVersions, isProfileStatement } from './edit-history.js';

const post = (id, author, timestamp, parsed) => ({ id, author, timestamp, parsed });

test('edits group under their target, same author only, oldest first', () => {
  const original = post('root', 'alice', 100, { body: 'Original' });
  const first = post('e1', 'alice', 200, { edit: 'root', body: 'First edit' });
  const second = post('e2', 'alice', 150, { edit: 'root', body: 'Second edit, earlier' });
  const foreign = post('e3', 'mallory', 300, { edit: 'root', body: 'Hijack' });
  const orphan = post('e4', 'alice', 400, { edit: 'missing', body: 'No target' });
  const byTarget = collectEdits([second, original, foreign, first, orphan]);
  assert.deepEqual(byTarget.get('root').map(edit => edit.id), ['e2', 'e1']);
  assert.equal(byTarget.has('missing'), false);
});

test('attachEditHistory hides edit records and copies edits onto targets', () => {
  const original = post('root', 'alice', 100, { body: 'Original' });
  const edit = post('e1', 'alice', 200, { edit: 'root', body: 'Edited' });
  const other = post('other', 'bob', 300, { body: 'Unrelated' });
  const rows = attachEditHistory([original, edit, other]);
  assert.deepEqual(rows.map(row => row.id), ['root', 'other']);
  assert.deepEqual(rows[0].edits.map(row => row.id), ['e1']);
  assert.equal(rows[0] === original, false, 'host records are not mutated');
  assert.equal(rows[1], other);
  assert.equal(rows[1].edits, undefined);
});

test('editVersions lists the original first, then edits, with body fallback', () => {
  const versions = editVersions({
    id: 'root', timestamp: 100, parsed: { body: 'Original' },
    edits: [
      { id: 'e1', timestamp: 200, parsed: { body: 'First' } },
      { id: 'e2', timestamp: 300, parsed: {} },
    ],
  });
  assert.deepEqual(versions.map(version => version.body), ['Original', 'First', 'Original']);
  assert.deepEqual(versions.map(version => version.id), ['root', 'e1', 'e2']);
});

test('isProfileStatement matches name/image/bio records with no post content', () => {
  assert.equal(isProfileStatement(post('p', 'alice', 1, { name: 'Alice', image: 'hash' })), true);
  assert.equal(isProfileStatement(post('p', 'alice', 1, { bio: 'Hello' })), true);
  assert.equal(isProfileStatement(post('p', 'alice', 1, { body: 'A post', name: 'Alice' })), false);
  assert.equal(isProfileStatement(post('p', 'alice', 1, { edit: 'root', body: 'Edited' })), false);
  assert.equal(isProfileStatement(post('p', 'alice', 1, {})), false);
});
