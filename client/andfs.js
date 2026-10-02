export const DEFAULT_MEDIA_MIME = new Set([
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

// Creates the exact signed upload metadata shared with evbogue.com's Timeline.
export function createAndFSMediaClient(
  {
    files,
    signPayload,
    fetchImpl = fetch,
    endpoint = "/api/media",
    origin = () => location.origin,
    allowedMime = DEFAULT_MEDIA_MIME,
    maxBytes = 32 * 1024 * 1024,
  },
) {
  if (!files?.add || !signPayload) {
    throw new Error("AndFS files and signing adapter are required");
  }
  return {
    async upload(input, { reply, replyto, onStatus } = {}) {
      const mime = (input.type || "").split(";")[0].toLowerCase();
      if (!allowedMime.has(mime)) {
        throw new Error("Unsupported image, audio, or video format");
      }
      if (!input.size || input.size > maxBytes) {
        throw new Error(
          `Media must be between 1 byte and ${maxBytes / 1024 / 1024} MiB`,
        );
      }
      onStatus?.("Preparing verified AndFS attachment…");
      const added = await files.add(input);
      const authorization = JSON.stringify({
        action: "andfs-upload-v1",
        andfs: added.manifestHash,
        mime,
        media_size: input.size,
        ...(reply ? { reply } : {}),
        ...(replyto ? { replyto } : {}),
      });
      onStatus?.("Uploading verified AndFS attachment…");
      const response = await fetchImpl(endpoint, {
        method: "POST",
        body: input,
        headers: {
          "X-ANProto-Content": authorization,
          "X-ANProto-Signature": await signPayload(authorization),
        },
      });
      if (!response.ok) {
        throw new Error(
          (await response.text()) || `Upload failed (${response.status})`,
        );
      }
      const media_url = origin() + "/media/" + added.manifestHash;
      return {
        type: mime.split("/")[0],
        andfs: added.manifestHash,
        mime,
        media_name: input.name || `${mime.split("/")[0]}-${Date.now()}`,
        media_size: input.size,
        media_url,
        media_source: origin(),
      };
    },
  };
}
