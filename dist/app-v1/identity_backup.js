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
