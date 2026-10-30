import nacl from "./lib/nacl-fast-es.js";
import { decode, encode } from "./lib/base64.js";

export const an = {};

an.gen = async () => {
  const g = await nacl.sign.keyPair();
  const k = await encode(g.publicKey) + encode(g.secretKey);
  return k;
};

an.hash = async (d) => {
  return encode(
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(d)),
      ),
    ),
  );
};

an.sign = async (h, k) => {
  const ts = Date.now();
  const s = encode(
    nacl.sign(new TextEncoder().encode(ts + h), decode(k.substring(44))),
  );

  return k.substring(0, 44) + s;
};

an.open = async (m) => {
  const o = new TextDecoder().decode(
    nacl.sign.open(decode(m.substring(44)), decode(m.substring(0, 44))),
  );

  return o;
};
