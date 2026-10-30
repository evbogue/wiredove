import { createProtocol, isMessageHash } from "./protocol.js";
import { createWiredoveRelay } from "./relay.js";

let defaultProtocol;
export async function loadFeedProtocol() {
  defaultProtocol ||= Promise.all([
    import("https://esm.sh/gh/evbogue/anproto@ddc040c/an.js"),
    import("https://esm.sh/gh/evbogue/apds@e091911502c46feaff8f18ec9865c23f42a7dc40/lib/yaml.js"),
  ]).then(([{ an }, { yaml }]) => createProtocol({ an, yaml }))
    .catch((error) => { defaultProtocol = null; throw error; });
  return await defaultProtocol;
}

// Only request public keys and hashes; never publish or create an identity.
export async function loadWiredoveFeed({
  feed, baseURL = "https://pub.wiredove.net", limit = 40,
  protocol, relay, signal,
} = {}) {
  if (!isMessageHash(feed)) throw new Error("Feed must be an ANProto public key");
  if (!/^https?:$/.test(new URL(baseURL).protocol)) throw new Error("Relay must use HTTP(S)");
  protocol ||= await loadFeedProtocol();
  relay ||= createWiredoveRelay({ baseURL });
  const count = Math.max(1, Math.min(200, Number(limit) || 40));
  const check = () => signal?.throwIfAborted();
  const posts = [];
  const visited = new Set();
  let lookup = feed;
  while (posts.length < count) {
    check();
    const candidates = await relay.gossip(lookup);
    check();
    let post;
    for (const signature of candidates) {
      let proof;
      try { proof = await protocol.open(signature); }
      catch { continue; }
      if (proof.author !== feed) continue;
      const contents = await relay.gossip(proof.contentHash);
      check();
      for (const content of contents) {
        try {
          const verified = await protocol.verify(signature, content);
          if (lookup !== feed && verified.id !== lookup) continue;
          if (!verified.parsed || typeof verified.parsed !== "object") continue;
          post = verified;
          break;
        } catch { /* Ignore bytes that fail authentication. */ }
      }
      if (post) break;
    }
    if (!post) {
      if (candidates.length || posts.length) {
        throw new Error("Feed content is unavailable or failed verification");
      }
      break;
    }
    if (visited.has(post.id)) break;
    visited.add(post.id);
    posts.push(post);
    lookup = post.parsed.previous;
    if (!lookup) break;
    if (!isMessageHash(lookup)) throw new Error("Invalid previous-message link");
  }
  check();
  return posts.sort((a, b) => b.timestamp - a.timestamp);
}
