import { an } from '../vendor/anproto/an.js'
import { yaml } from '../vendor/apds/yaml.js'

// APDS d9326cb's three read-only operations, without its browser database.
export const serverProtocol = {
  hash: an.hash,
  async open(message) { try { return await an.open(message) } catch { return undefined } },
  parseYaml: yaml.parse,
}
