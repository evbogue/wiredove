// Transport- and UI-free ANProto message helpers.  The host provides the
// ANProto and YAML implementations so its exact serialized bytes stay intact.
export const isMessageHash = (value) =>
  typeof value === "string" && /^[A-Za-z0-9+/]{43}=$/.test(value);

export const isAndFSHash = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

export function createProtocol({ an, yaml, now = () => Date.now() }) {
  if (!an?.hash || !an?.sign || !an?.open || !yaml?.parse || !yaml?.create) {
    throw new Error("ANProto and YAML adapters are required");
  }

  async function open(signature) {
    if (
      typeof signature !== "string" || signature.length !== 208 ||
      !isMessageHash(signature.slice(0, 44))
    ) {
      throw new Error("Invalid ANProto signature");
    }
    let opened;
    try {
      opened = await an.open(signature);
    } catch {
      throw new Error("Invalid ANProto signature");
    }
    if (!/^\d{13}[A-Za-z0-9+/]{43}=$/.test(opened)) {
      throw new Error("Invalid signed timestamp and hash");
    }
    return {
      author: signature.slice(0, 44),
      timestamp: Number(opened.slice(0, 13)),
      contentHash: opened.slice(13),
    };
  }

  async function verify(signature, content, { maxBytes = 65536 } = {}) {
    if (
      typeof content !== "string" ||
      new TextEncoder().encode(content).length > maxBytes
    ) throw new Error("Post exceeds size limit");
    const proof = await open(signature);
    if (await an.hash(content) !== proof.contentHash) {
      throw new Error("Content hash does not match signature");
    }
    if (proof.timestamp > now() + 300000) {
      throw new Error("Post timestamp is in the future");
    }
    return {
      id: await an.hash(signature),
      signature,
      content,
      ...proof,
      parsed: await yaml.parse(content),
    };
  }

  async function compose(keypair, body, metadata = {}) {
    const content = await yaml.create(metadata, body);
    if (!content) throw new Error("Could not encode post");
    return await verify(
      await an.sign(await an.hash(content), keypair),
      content,
    );
  }

  async function signPayload(payload, keypair) {
    if (typeof payload !== "string") {
      throw new Error("Payload must be a string");
    }
    return await an.sign(await an.hash(payload), keypair);
  }

  return { open, verify, compose, signPayload };
}
