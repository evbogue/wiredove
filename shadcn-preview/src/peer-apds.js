import { startPeerSync } from './peer-sync'

export let apds

export async function preparePeerStorage() {
  apds = await startPeerSync()
}
