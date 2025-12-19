import { apds } from 'apds'

export const lookup = {}

let replyMap = new Map()

lookup.build = async () => {
  const log = await apds.getOpenedLog()
  replyMap.clear()
  for (const msg of log) {
    if (msg.text) {
      const yaml = await apds.parseYaml(msg.text)
      const reply = yaml.reply || yaml.replyHash
      if (reply) {
        if (!replyMap.has(reply)) {
          replyMap.set(reply, [])
        }
        replyMap.get(reply).push(msg.hash)
      }
    }
  }
  await lookup.save()
}

lookup.save = async () => {
  const obj = Object.fromEntries(replyMap)
  await apds.put('reply_index', JSON.stringify(obj))
}

lookup.load = async () => {
  const stored = await apds.get('reply_index')
  if (stored) {
    try {
      const obj = JSON.parse(stored)
      replyMap = new Map(Object.entries(obj))
    } catch (e) {
      await lookup.build()
    }
  } else {
    await lookup.build()
  }
}

lookup.get = async (hash) => {
  if (replyMap.size === 0) {
    await lookup.load()
  }
  const hashes = replyMap.get(hash) || []
  return hashes.map(h => ({ hash: h }))
}

lookup.add = async (replyTo, hash) => {
  if (!replyMap.has(replyTo)) {
    replyMap.set(replyTo, [])
  }
  const list = replyMap.get(replyTo)
  if (!list.includes(hash)) {
    list.push(hash)
    await lookup.save()
  }
}

lookup.process = async (msg) => {
  if (msg.text) {
    const yaml = await apds.parseYaml(msg.text)
    const reply = yaml.reply || yaml.replyHash
    if (reply) {
      await lookup.add(reply, msg.hash)
    }
  }
}
