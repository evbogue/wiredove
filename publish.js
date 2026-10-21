#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env

// ANProto message publisher for Wiredove
// Uses the same ANProto library commit as the browser app (anproto@ddc040c)

import { an } from 'https://esm.sh/gh/evbogue/anproto@ddc040c/an.js'

const RELAY = 'https://pub.wiredove.net'
const STATE_DIR = Deno.env.get('HOME') + '/.anproto'
const STATE_FILE = STATE_DIR + '/state.json'

async function loadState() {
  try {
    return JSON.parse(await Deno.readTextFile(STATE_FILE))
  } catch {
    return {}
  }
}

async function saveState(state) {
  await Deno.mkdir(STATE_DIR, { recursive: true })
  await Deno.writeTextFile(STATE_FILE, JSON.stringify(state, null, 2))
}

// Produces the same front-matter format as apds yaml.create()
function buildYaml(meta, body) {
  const entries = Object.entries(meta).filter(([, v]) => v != null && v !== '')
  if (!entries.length) return body
  return `---\n${entries.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n${body}`
}

async function gossipPost(blob) {
  const res = await fetch(`${RELAY}/gossip`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: blob,
  })
  return res.ok
}

async function publish(text, extraMeta = {}) {
  const state = await loadState()
  if (!state.keypair) {
    console.error('No keypair found. Run: publish.js genkey')
    Deno.exit(1)
  }

  const meta = {}
  if (state.name) meta.name = state.name
  if (state.previous) meta.previous = state.previous
  Object.assign(meta, extraMeta)

  // Build YAML content blob (same format the browser app produces)
  const content = buildYaml(meta, text)

  // Sign: hash content → sign hash → hash signed blob
  const contentHash = await an.hash(content)
  const signed = await an.sign(contentHash, state.keypair)
  const msgHash = await an.hash(signed)

  // Publish both blobs so peers can verify and fetch content by hash
  const [ok1, ok2] = await Promise.all([gossipPost(signed), gossipPost(content)])
  if (!ok1 || !ok2) {
    console.error('Relay rejected one or both blobs (non-2xx response).')
    Deno.exit(1)
  }

  // Persist the new message hash as previous for chain continuity
  state.previous = msgHash
  await saveState(state)

  console.log('Published:', msgHash)
  console.log('URL: https://wiredove.net/#' + msgHash)
  return msgHash
}

// ── subcommands ───────────────────────────────────────────────────────────────

async function cmdGenkey(force) {
  const state = await loadState()
  if (state.keypair && !force) {
    console.log('Keypair already exists.')
    console.log('Pubkey:', state.keypair.substring(0, 44))
    console.log('Use --force to overwrite (this will orphan your message chain).')
    return
  }
  state.keypair = await an.gen()
  delete state.previous
  await saveState(state)
  console.log('Keypair generated.')
  console.log('Pubkey:', state.keypair.substring(0, 44))
}

async function cmdProfile(args) {
  const state = await loadState()
  const ni = args.indexOf('--name')
  if (ni === -1 || !args[ni + 1]) {
    console.log('Usage: publish.js profile --name <display-name>')
    return
  }
  state.name = args[ni + 1]
  await saveState(state)
  console.log('Name set to:', state.name)
}

async function cmdStatus() {
  const state = await loadState()
  if (!state.keypair) {
    console.log('No keypair. Run: publish.js genkey')
    return
  }
  console.log('Pubkey:  ', state.keypair.substring(0, 44))
  console.log('Name:    ', state.name ?? '(not set — run: publish.js profile --name <name>)')
  console.log('Previous:', state.previous ?? '(none — first post will have no chain link)')
}

// ── main ──────────────────────────────────────────────────────────────────────

const [cmd, ...rest] = Deno.args

switch (cmd) {
  case 'genkey':
    await cmdGenkey(rest.includes('--force'))
    break

  case 'profile':
    await cmdProfile(rest)
    break

  case 'status':
    await cmdStatus()
    break

  case 'post':
    if (!rest.length) { console.error('Usage: publish.js post <text>'); Deno.exit(1) }
    await publish(rest.join(' '))
    break

  case 'reply': {
    if (rest.length < 2) {
      console.error('Usage: publish.js reply <message-hash> <text>')
      Deno.exit(1)
    }
    const [replyHash, ...msgParts] = rest
    if (replyHash.length !== 44) {
      console.error('Message hash must be 44 characters (base64 SHA-256).')
      Deno.exit(1)
    }
    await publish(msgParts.join(' '), { reply: replyHash })
    break
  }

  default:
    console.log(`ANProto message publisher for Wiredove

Usage:
  publish.js genkey [--force]        Generate a new ed25519 keypair
  publish.js profile --name <name>   Set your display name
  publish.js status                  Show identity and chain state
  publish.js post <text>             Compose and publish a message
  publish.js reply <hash> <text>     Reply to an existing message

State file: ${STATE_FILE}
Relay:      ${RELAY}

Run with Deno:
  deno run --allow-net --allow-read --allow-write --allow-env publish.js <cmd>
`)
}
