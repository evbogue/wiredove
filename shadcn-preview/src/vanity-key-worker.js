import { an } from '../../vendor/anproto/an.js'
import { encode } from '../../vendor/anproto/lib/base64.js'

const limit = 32768
const generate = () => crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])

async function findKey(prefix) {
  let pair
  try {
    pair = await generate()
  } catch (error) {
    if (error.name !== 'NotSupportedError') throw error
    for (let attempt = 0; attempt < limit; attempt++) {
      const keypair = await an.gen()
      if (keypair.startsWith(prefix)) return keypair
    }
    return
  }

  for (let attempt = 0; attempt < limit; attempt++) {
    if (attempt) pair = await generate()
    const publicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    const publicKey = encode(publicBytes)
    if (!publicKey.startsWith(prefix)) continue
    const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const privateBytes = new Uint8Array(64)
    // ANProto stores the Ed25519 seed followed by the public key.
    privateBytes.set(Uint8Array.from(atob(d.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0)))
    privateBytes.set(publicBytes, 32)
    return publicKey + encode(privateBytes)
  }
}

self.onmessage = async ({ data: prefix }) => {
  try {
    const keypair = await findKey(prefix)
    self.postMessage(keypair ? { keypair } : { error: 'No match found. Try searching again.' })
  } catch {
    self.postMessage({ error: 'Could not generate a key. Try again.' })
  }
}
