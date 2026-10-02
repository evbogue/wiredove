import { createAndFSMediaClient } from "./andfs.js";
import { displayName, human } from "./render.js";
import { createWiredoveRelay } from "./relay.js";

Deno.test("shared renderer uses Wiredove's name and human-time defaults", () => {
  if (displayName({}, "abcdefghijkl") !== "abcdefghij") {
    throw new Error("wrong public-key name fallback");
  }
  if (displayName({ name: "Ev" }, "abcdefghijkl") !== "Ev") {
    throw new Error("profile name was ignored");
  }
  if (human(Date.now() - 60_000) !== "1m") {
    throw new Error("wrong APDS human-time format");
  }
});

Deno.test("AndFS client signs the exact Timeline upload contract", async () => {
  let signed, request;
  const client = createAndFSMediaClient({
    files: { add: async () => ({ manifestHash: "A".repeat(43) }) },
    signPayload: async (payload) => {
      signed = payload;
      return "signature";
    },
    origin: () => "https://wiredove.example",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response("{}", { status: 201 });
    },
  });
  const attachment = await client.upload(
    new File(["hello"], "hello.webp", { type: "image/webp" }),
  );
  const authorization = JSON.parse(signed);
  if (
    authorization.action !== "andfs-upload-v1" ||
    authorization.andfs !== "A".repeat(43)
  ) throw new Error("wrong upload contract");
  if (request.init.headers["X-ANProto-Signature"] !== "signature") {
    throw new Error("unsigned upload");
  }
  if (
    attachment.media_url !== "https://wiredove.example/media/" + "A".repeat(43)
  ) throw new Error("wrong media URL");
});

Deno.test("relay publishes content before signature and confirms message ID", async () => {
  const writes = [];
  const relay = createWiredoveRelay({
    baseURL: "https://relay.example",
    fetchImpl: async (_url, init = {}) => {
      if (init.method === "POST") {
        writes.push(init.body);
        return Response.json({
          messages: init.body === "message-id" ? ["signature"] : [],
        });
      }
      return Response.json({ messages: [], nextSince: 0 });
    },
  });
  await relay.publish({
    content: "content",
    signature: "signature",
    id: "message-id",
  });
  if (writes.join(",") !== "content,signature,message-id") {
    throw new Error("wrong relay order");
  }
});
