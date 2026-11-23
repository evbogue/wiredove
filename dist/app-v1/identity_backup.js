import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'
import { saveIdentityBackupFile } from './client/core/identity-backup.js'

export { validateIdentityBackup } from './client/core/identity-backup.js'

export const downloadIdentityBackup = async () => {
  const keypair = await apds.keypair()
  if (!keypair) throw new Error('No identity to back up')
  saveIdentityBackupFile(keypair)
}
