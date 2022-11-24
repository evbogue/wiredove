import nacl from './lib/nacl-fast-es.js'
import { decode, encode } from './lib/base64.js'
import { cachekv } from './lib/cachekv.js'

const newNonce = () => nacl.randomBytes(nacl.box.nonceLength)


export async function box (msg, dest, key) {
  const nonce = newNonce()
  const messageUint8 = new TextEncoder().encode(msg)
  const recp = decode(dest)
  const privkey = decode(key)
  const encrypted = nacl.box(messageUint8, nonce, recp, privkey)

  const fullMessage = new Uint8Array(nonce.length + encrypted.length)

  fullMessage.set(nonce)
  fullMessage.set(encrypted, nonce.length)

  const base64FullMessage = encode(fullMessage)
  return keys.pubkey() + base64FullMessage
}

export async function unbox (msgWithNonce, pub, key) {
  const messageWithNonceAsUint8Array = decode(msgWithNonce)
  const nonce = messageWithNonceAsUint8Array.slice(0, nacl.box.nonceLength)
  const message = messageWithNonceAsUint8Array.slice(
    nacl.box.nonceLength,
    msgWithNonce.length
  )
  const pubkey = decode(pub)
  const privkey = decode(key)
  const decrypted = nacl.box.open(message, nonce, pubkey, privkey)

  if (decrypted) {
    const message = new TextDecoder().decode(decrypted)
    return message
  }
}


//export async function box (msg, dest, keys) {
//  const recp = decode(dest)
//  const sender = decode(keys.substring(0, 44))
//  const privatekey = decode(keys.substring(44))
//  const nonce = nacl.randomBytes(nacl.box.nonceLength)
//  const message = new TextEncoder().encode(msg)
//  const boxed = nacl.box(message, nonce, recp, privatekey)
//  const nonceMsg = new Uint8Array(sender.length + nonce.length + boxed.length)
//
//  nonceMsg.set(sender)
//  nonceMsg.set(nonce, sender.length)
//  nonceMsg.set(boxed, sender.length + nonce.length)
//
//  return encode(nonceMsg)
//}
//
//export async function unbox (envelope, keys) {
//  const boxed = decode(envelope)
//  const privatekey = decode(keys.substring(44))
//  const senderkey = boxed.slice(0, 32)
//  const nonce = boxed.slice(32, 32 + 24)
//  const msg = boxed.slice(32 + 24)
//
//  const unboxed = nacl.box.open(msg, nonce, senderkey, privatekey)
//
//  if (unboxed) {
//    const message = new TextDecoder().decode(unboxed)
//    return message
//  }
//}

export async function genkey () {
  const genkey = nacl.box.keyPair()
  const key = encode(genkey.publicKey) + encode(genkey.secretKey)
  cachekv.put('keypair', key)
  location.reload()
}

export let keys

cachekv.get('keypair').then(keypair => {
  if (!keypair) {
    genkey()
  }
  if (keypair) {
    keys = {
      keypair: function () {
        return keypair
      },
      pubkey: function () {
        return keypair.substring(0, 44)
      },
      privkey: function () {
        return keypair.substring(44, keys.length)
      }
    }
  }
})
