import { an } from './vendor/anproto/an.js'
import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'

export const downloadIdentityBackup = async () => {
  const keypair = await apds.keypair()
  if (!keypair) throw new Error('No identity to back up')
  const url = URL.createObjectURL(new Blob([keypair], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'wiredove-identity.txt'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const validateIdentityBackup = async value => {
  let keypair = String(value || '').trim()
  if (keypair.startsWith('{')) keypair = JSON.parse(keypair).keypair
  if (typeof keypair !== 'string') throw Error('This backup has no keypair')
  const challenge = await an.hash('Wiredove identity import check')
  const signature = await an.sign(challenge, keypair)
  if ((await an.open(signature)).substring(13) !== challenge || signature.substring(0,44) !== keypair.substring(0,44)) throw Error('Invalid identity backup')
  return keypair
}
