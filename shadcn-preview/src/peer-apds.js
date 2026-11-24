import { hostedPreview, openIdentity } from './social'

export let apds

export async function preparePeerStorage() {
  apds = await openIdentity(hostedPreview)
}
