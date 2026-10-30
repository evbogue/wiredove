// Pinned to the same AndFS revision vendored by evbogue.com's timeline.
import { createAndFS } from "./vendor/andfs/andfs.js";
import { browserStore } from "./vendor/andfs/stores.js";
import { an } from "https://esm.sh/gh/evbogue/anproto@01284a213d54e5a802228eafa64f8d95c4db2f67/an.js";
import { apds } from "apds";
import { createAndFSMediaClient } from "./client/andfs.js";
import { renderAndFSMedia } from "./client/render.js";

const allowed = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "video/mp4",
  "video/ogg",
  "video/webm",
]);

export async function storeAndFS(input, { reply, replyto, onStatus } = {}) {
  const keypair = await apds.keypair();
  if (!keypair) throw new Error("Generate a keypair before uploading media");
  const files = createAndFS({ store: await browserStore("wiredove-andfs-v1") });
  return await createAndFSMediaClient({
    files,
    allowedMime: allowed,
    signPayload: async (payload) =>
      await an.sign(await an.hash(payload), keypair),
  }).upload(input, { reply, replyto, onStatus });
}

export { renderAndFSMedia } from "./client/render.js";
