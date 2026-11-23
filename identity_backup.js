import { apds } from 'apds'
import { saveIdentityBackupFile } from './client/core/identity-backup.js'

export { validateIdentityBackup } from './client/core/identity-backup.js'

export const downloadIdentityBackup = async () => {
  const keypair = await apds.keypair()
  if (!keypair) throw new Error('No identity to back up')
  saveIdentityBackupFile(keypair)
}
