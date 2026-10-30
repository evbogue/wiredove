import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { createNotificationsService } from "./notifications_server.js";
import { an } from "https://esm.sh/gh/evbogue/anproto@01284a213d54e5a802228eafa64f8d95c4db2f67/an.js";
import { createAndFS, MAX_MANIFEST } from "./vendor/andfs/andfs.js";

const notifications = await createNotificationsService();
const BLOB_DIR = Deno.env.get("BLOB_DIR") || "./data/blobs";
const ANDFS_DIR = Deno.env.get("ANDFS_DIR") || "./data/andfs";
const MEDIA_DIR = Deno.env.get("MEDIA_DIR") || "./data/media";
await Deno.mkdir(BLOB_DIR, { recursive: true });
await Deno.mkdir(ANDFS_DIR, { recursive: true });
await Deno.mkdir(MEDIA_DIR, { recursive: true });

const validBlobId = (id) =>
  /^anblob:v1:(raw|chunked):sha256:[A-Za-z0-9_-]+$/.test(id);
const validAndFS = (id) => /^[A-Za-z0-9_-]{43}$/.test(id);

const blobPath = (id) => `${BLOB_DIR}/${encodeURIComponent(id)}`;
const andfsPath = (id) => `${ANDFS_DIR}/${id}`;
const andfsStore = {
  async get(id) {
    try {
      return await Deno.readFile(andfsPath(id));
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return undefined;
      throw err;
    }
  },
  async put(id, bytes) {
    const path = andfsPath(id);
    try {
      await Deno.stat(path);
      return;
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    const tmp = path + "." + crypto.randomUUID() + ".tmp";
    await Deno.writeFile(tmp, bytes);
    try {
      await Deno.rename(tmp, path);
    } catch (err) {
      await Deno.remove(tmp).catch(() => {});
      if (!(err instanceof Deno.errors.AlreadyExists)) throw err;
    }
  },
};
const andfs = createAndFS({ store: andfsStore });
const mediaMeta = new Map();
const MAX_MEDIA = 32 * 1024 * 1024;
const MIME = new Set([
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

for await (const entry of Deno.readDir(MEDIA_DIR)) {
  if (!entry.isFile || !entry.name.endsWith(".json")) continue;
  try {
    const meta = JSON.parse(
      await Deno.readTextFile(`${MEDIA_DIR}/${entry.name}`),
    );
    if (validAndFS(meta.andfs) && MIME.has(meta.mime)) {
      mediaMeta.set(meta.andfs, meta);
    }
  } catch { /* Ignore malformed metadata. */ }
}
const saveMeta = async (meta) => {
  const path = `${MEDIA_DIR}/${meta.andfs}.json`,
    tmp = `${path}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(tmp, JSON.stringify(meta));
  await Deno.rename(tmp, path);
};

const readLimited = async (body, limit) => {
  const bytes = new Uint8Array(await new Response(body).arrayBuffer());
  if (bytes.length > limit) throw new Error("media exceeds 32 MiB");
  return bytes;
};
const range = (value, size) => {
  if (!value) return { start: 0, end: size, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new Error("bad range");
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? (match[2] ? Math.min(size, Number(match[2]) + 1) : size)
    : size;
  if (
    !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 ||
    start >= end || end > size
  ) throw new Error("bad range");
  return { start, end, status: 206 };
};

const handleAndFS = async (request) => {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/media") {
    const content = request.headers.get("X-ANProto-Content"),
      signature = request.headers.get("X-ANProto-Signature");
    if (!content || !signature || content.length > 8192) {
      return new Response("missing upload authorization", { status: 400 });
    }
    const opened = await an.open(signature).catch(() => null);
    if (
      !opened || !/^\d{13}[A-Za-z0-9+/]{43}=$/.test(opened) ||
      Math.abs(Date.now() - Number(opened.slice(0, 13))) > 300000 ||
      await an.hash(content) !== opened.slice(13)
    ) {
      return new Response("invalid or expired upload authorization", {
        status: 403,
      });
    }
    let meta;
    try {
      meta = JSON.parse(content);
    } catch {
      return new Response("invalid upload authorization", { status: 400 });
    }
    if (
      meta.action !== "andfs-upload-v1" || !validAndFS(meta.andfs) ||
      !MIME.has(meta.mime) || !Number.isSafeInteger(meta.media_size) ||
      meta.media_size < 1 || meta.media_size > MAX_MEDIA
    ) return new Response("unsupported media", { status: 400 });
    if (mediaMeta.has(meta.andfs)) {
      return Response.json(mediaMeta.get(meta.andfs));
    }
    const bytes = await readLimited(request.body, meta.media_size);
    if (bytes.length !== meta.media_size) {
      return new Response("incomplete upload", { status: 400 });
    }
    const added = await andfs.add(bytes);
    if (added.manifestHash !== meta.andfs) {
      return new Response("media does not match AndFS manifest", {
        status: 400,
      });
    }
    const saved = {
      andfs: meta.andfs,
      mime: meta.mime,
      media_size: meta.media_size,
    };
    await saveMeta(saved);
    mediaMeta.set(meta.andfs, saved);
    return Response.json(mediaMeta.get(meta.andfs), { status: 201 });
  }
  if (url.pathname.startsWith("/media/")) {
    const id = url.pathname.slice(7), meta = mediaMeta.get(id);
    if (!validAndFS(id) || !meta) return new Response(null, { status: 404 });
    const manifest = await andfs.manifest(id);
    let bytes;
    try {
      bytes = range(request.headers.get("range"), manifest.size);
    } catch {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${manifest.size}` },
      });
    }
    const headers = new Headers({
      "content-type": meta.mime,
      "content-length": String(bytes.end - bytes.start),
      "accept-ranges": "bytes",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=31536000, immutable",
    });
    if (bytes.status === 206) {
      headers.set(
        "content-range",
        `bytes ${bytes.start}-${bytes.end - 1}/${manifest.size}`,
      );
    }
    return new Response(
      request.method === "HEAD" ? null : andfs.read(id, bytes),
      { status: bytes.status, headers },
    );
  }
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    url.pathname.startsWith("/blobs/")
  ) {
    const id = url.pathname.slice(7);
    if (!validAndFS(id)) return null;
    try {
      const bytes = await andfs.getBlock(id, { maxBytes: MAX_MANIFEST });
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(bytes.length),
          "access-control-allow-origin": "*",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
  return null;
};

const handleBlobRequest = async (request) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/blobs/")) return null;

  const encoded = url.pathname.slice("/blobs/".length);
  let id;
  try {
    id = decodeURIComponent(encoded);
  } catch {
    return new Response("bad blob id", { status: 400 });
  }
  if (!validBlobId(id)) return new Response("bad blob id", { status: 400 });

  const path = blobPath(id);

  if (request.method === "PUT") {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const temp = `${path}.${crypto.randomUUID()}.tmp`;
    await Deno.writeFile(temp, bytes);
    await Deno.rename(temp, path);
    return new Response(null, { status: 204 });
  }

  if (request.method === "GET" || request.method === "HEAD") {
    try {
      const stat = await Deno.stat(path);
      const headers = new Headers({
        "content-type": "application/octet-stream",
        "content-length": String(stat.size),
        "cache-control": "public, max-age=31536000, immutable",
      });
      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }
      return new Response(await Deno.readFile(path), { status: 200, headers });
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return new Response(null, { status: 404 });
      }
      throw err;
    }
  }

  return new Response("method not allowed", {
    status: 405,
    headers: { allow: "GET, HEAD, PUT" },
  });
};

Deno.serve({ port: Number(Deno.env.get("PORT") || 8000) }, async (r) => {
  const andfsResponse = await handleAndFS(r);
  if (andfsResponse) return andfsResponse;
  const blobResponse = await handleBlobRequest(r);
  if (blobResponse) return blobResponse;
  const handled = await notifications.handleRequest(r);
  if (handled) return handled;
  const staticResponse = await serveDir(r, { quiet: "True" });
  // The client package is intentionally embeddable by other HTTPS origins,
  // including evbogue.com's Timeline. It contains no user data or write API.
  if (new URL(r.url).pathname.startsWith("/client/")) {
    staticResponse.headers.set("Access-Control-Allow-Origin", "*");
  }
  return staticResponse;
});
