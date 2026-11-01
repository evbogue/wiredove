import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueSend, registerNetworkSenders, subscribeHashRequest, completeHashRequest, clearQueue, getQueueSize, pauseQueue, resumeQueue } from '../network_queue.js';

test('image requests report queued, sent, timed out, retry and received states', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hash = 'a'.repeat(43) + '=';
  const states = [];
  const stop = subscribeHashRequest(hash, ({ state }) => states.push(state));
  registerNetworkSenders({ hasWs: () => false, hasGossip: () => false });
  queueSend(hash);
  assert.equal(states.at(-1), 'queued');
  t.mock.timers.tick(1000);
  assert.equal(states.at(-1), 'queued');
  const sent = [];
  registerNetworkSenders({ hasWs: () => true, sendWs: msg => sent.push(msg) });
  t.mock.timers.tick(100);
  assert.deepEqual(sent, [hash]);
  assert.equal(states.at(-1), 'requested');
  t.mock.timers.tick(15000);
  assert.equal(states.at(-1), 'idle');
  assert.equal(getQueueSize(), 0);
  assert.equal(queueSend(hash, { retry: true }), true);
  assert.equal(states.at(-1), 'queued');
  completeHashRequest(hash);
  assert.equal(states.at(-1), 'received');
  assert.equal(getQueueSize(), 0);
  stop(); clearQueue();
});

test('queued image requests time out to idle when no transport becomes ready', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hash = 'b'.repeat(43) + '=';
  const states = [];
  const stop = subscribeHashRequest(hash, ({ state }) => states.push(state));
  registerNetworkSenders({ hasWs: () => false, hasGossip: () => false });
  queueSend(hash);
  assert.equal(states.at(-1), 'queued');
  assert.equal(getQueueSize(), 1);
  t.mock.timers.tick(45000);
  assert.equal(states.at(-1), 'idle');
  assert.equal(getQueueSize(), 0);
  stop(); clearQueue();
});

test('pausing publishes paused and resuming restores the queued request', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hash = 'c'.repeat(43) + '=';
  const states = [];
  const stop = subscribeHashRequest(hash, ({ state }) => states.push(state));
  registerNetworkSenders({ hasWs: () => false, hasGossip: () => false });
  queueSend(hash);
  assert.equal(states.at(-1), 'queued');
  pauseQueue();
  assert.equal(states.at(-1), 'paused');
  t.mock.timers.tick(60000);
  assert.equal(states.at(-1), 'paused', 'paused requests must not time out');
  resumeQueue();
  assert.equal(states.at(-1), 'queued');
  assert.equal(getQueueSize(), 1);
  stop(); clearQueue();
});
