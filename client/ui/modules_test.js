// Registration/import-boundary checks; these do not substitute for browser rendering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

globalThis.HTMLElement = class {};
const definitions = new Map();
globalThis.customElements = {
  get: (name) => definitions.get(name),
  define: (name, value) => {
    assert.ok(!definitions.has(name), `duplicate registration: ${name}`);
    definitions.set(name, value);
  },
};

test("individual message import is inert and has a narrow dependency graph", async () => {
  const { WiredoveMessage, defineWiredoveMessage } = await import("./message.js");
  assert.equal(definitions.size, 0, "import registered elements unexpectedly");
  assert.equal(defineWiredoveMessage(), WiredoveMessage);
  assert.equal(defineWiredoveMessage(), WiredoveMessage);
  assert.deepEqual([...definitions.keys()], ["wiredove-message"]);
  const visited = new Set();
  async function walk(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = await readFile(url, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
      const specifier = match[1];
      assert.ok(specifier.startsWith("."), `nonlocal dependency: ${specifier}`);
      await walk(new URL(specifier, url));
    }
  }
  await walk(new URL("./message.js", import.meta.url));
  for (const path of visited) {
    assert.ok(!/\/(?:composer|widget|register|feed|relay|protocol|app|route)\.js$/.test(path), `unexpected dependency: ${path}`);
  }
});

test("thread and feed register their message dependency explicitly", async () => {
  const { defineWiredoveThread } = await import("./thread.js");
  const { defineWiredoveThreadFeed } = await import("./feed.js");
  definitions.clear();
  defineWiredoveThread();
  assert.ok(definitions.has("wiredove-message"));
  assert.ok(definitions.has("wiredove-thread"));
  assert.ok(!definitions.has("wiredove-composer"));
  defineWiredoveThreadFeed();
  assert.ok(definitions.has("wiredove-thread-feed"));
});

test("compatibility entry point registers the original set idempotently", async () => {
  const { defineWiredoveElements, WiredoveMessage } = await import("../ui.js");
  const first = defineWiredoveElements();
  const second = defineWiredoveElements();
  assert.equal(first.WiredoveMessage, WiredoveMessage);
  assert.deepEqual(second, first);
  for (const name of ["message", "composer", "thread-feed", "thread", "widget", "media"]) {
    assert.ok(definitions.has(`wiredove-${name}`));
  }
});
