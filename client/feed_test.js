import { loadWiredoveFeed } from "./feed.js";
import { createProtocol } from "./protocol.js";

// Run with Deno, or Node's built-in runner: node --test client/feed_test.js
const test = globalThis.Deno?.test || (await import("node:test")).test;
const assert = (value, message) => { if (!value) throw new Error(message); };
const encode = (bytes) => btoa(String.fromCharCode(...bytes));
const decode = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const hash = async (text) => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
const author = encode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const protocol = createProtocol({
  an: {
    hash, sign: () => {},
    open: async (sig) => {
      const bytes = decode(sig.slice(44));
      const key = await crypto.subtle.importKey("raw", decode(sig.slice(0, 44)), "Ed25519", false, ["verify"]);
      if (!await crypto.subtle.verify("Ed25519", key, bytes.slice(0, 64), bytes.slice(64))) throw Error("bad signature");
      return new TextDecoder().decode(bytes.slice(64));
    },
  },
  yaml: { parse: JSON.parse, create: JSON.stringify },
});
const signed = async (metadata) => {
  const content = JSON.stringify(metadata);
  const payload = new TextEncoder().encode(Date.now() + await hash(content));
  const signatureBytes = new Uint8Array(await crypto.subtle.sign("Ed25519", pair.privateKey, payload));
  const signature = author + encode(new Uint8Array([...signatureBytes, ...payload]));
  return await protocol.verify(signature, content);
};
const older = await signed({ body: "old" });
const latest = await signed({ body: "reply", previous: older.id, reply: older.id });
const data = new Map([
  [author, ["untrusted hint", latest.signature]], [latest.contentHash, ["tampered", latest.content]],
  [older.id, [older.signature]], [older.contentHash, [older.content]],
]);
const relay = { gossip: async (key) => data.get(key) || [] };

test("loads authenticated author history, keeps replies and bounds reads", async () => {
  const posts = await loadWiredoveFeed({ feed: author, relay, protocol });
  assert(posts.length === 2 && posts.some(p => p.id === older.id), "missing history");
  assert(posts.some(p => p.parsed.reply === older.id), "lost reply");
  assert((await loadWiredoveFeed({ feed: author, relay, protocol, limit: 1 })).length === 1, "limit ignored");
});
test("rejects content tampering and a substituted previous signature", async () => {
  for (const key of [latest.contentHash, older.id]) {
    const saved = data.get(key);
    data.set(key, key === older.id ? [latest.signature] : ["tampered"]);
    let failed = false;
    try { await loadWiredoveFeed({ feed: author, relay, protocol }); } catch { failed = true; }
    data.set(key, saved);
    assert(failed, "unverified content accepted");
  }
});
test("empty feeds, bad configuration, relay failures and cancellation", async () => {
  assert((await loadWiredoveFeed({ feed: author, protocol, relay: { gossip: async () => [] } })).length === 0, "empty feed failed");
  for (const options of [
    { feed: "invalid" }, { baseURL: "javascript:alert(1)" },
    { relay: { gossip: async () => { throw Error("offline"); } } },
    { signal: AbortSignal.abort() },
  ]) {
    let failed = false;
    try { await loadWiredoveFeed({ feed: author, protocol, relay, ...options }); } catch { failed = true; }
    assert(failed, "error swallowed");
  }
});
