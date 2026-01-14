import webpush from 'npm:web-push@3.6.7'
import { apds } from 'https://esm.sh/gh/evbogue/apds@d9326cb/apds.js'

const DEFAULTS = {
  dataDir: './data',
  subsFile: './data/subscriptions.json',
  stateFile: './data/state.json',
  configFile: './config.json',
  vapidSubject: 'mailto:ops@wiredove.net',
  pushIconUrl: 'https://wiredove.net/dovepurple_sm.png',
}

async function readJsonFile(path, fallback) {
  try {
    const raw = await Deno.readTextFile(path)
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJsonFile(path, value) {
  const raw = JSON.stringify(value, null, 2)
  await Deno.writeTextFile(path, raw)
}

async function ensureVapidConfig(configPath, subject) {
  const fallback = {
    vapidPublicKey: '',
    vapidPrivateKey: '',
    vapidSubject: subject,
  }
  const config = await readJsonFile(configPath, fallback)

  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    const keys = webpush.generateVAPIDKeys()
    const nextConfig = {
      vapidPublicKey: keys.publicKey,
      vapidPrivateKey: keys.privateKey,
      vapidSubject: config.vapidSubject || subject,
    }
    await writeJsonFile(configPath, nextConfig)
    return nextConfig
  }

  if (!config.vapidSubject) {
    config.vapidSubject = subject
    await writeJsonFile(configPath, config)
  }

  return config
}

function subscriptionId(endpoint) {
  return btoa(endpoint).replaceAll('=', '')
}

async function parsePostText(text) {
  if (!text || typeof text !== 'string') return {}

  const raw = text.trim()
  let yamlBlock = ''
  let bodyText = ''

  if (raw.startsWith('---')) {
    const lines = raw.split('\n')
    const endIndex = lines.indexOf('---', 1)
    if (endIndex !== -1) {
      yamlBlock = lines.slice(1, endIndex).join('\n')
      bodyText = lines.slice(endIndex + 1).join('\n')
    }
  }

  let name
  let yamlBody
  try {
    const parsed = await apds.parseYaml(raw)
    if (parsed && typeof parsed === 'object') {
      name = typeof parsed.name === 'string' ? parsed.name.trim() : undefined
      yamlBody = typeof parsed.body === 'string' ? parsed.body.trim() : undefined
    }
  } catch {
    if (yamlBlock) {
      try {
        const parsed = await apds.parseYaml(yamlBlock)
        if (parsed && typeof parsed === 'object') {
          name = typeof parsed.name === 'string' ? parsed.name.trim() : undefined
          yamlBody = typeof parsed.body === 'string' ? parsed.body.trim() : undefined
        }
      } catch {
        // Fall back to raw body if YAML parsing fails.
      }
    }
  }

  const body = bodyText.trim() || (yamlBody || '').trim()

  return {
    name: name || undefined,
    body: body || undefined,
  }
}

function formatPushTitle(name, author) {
  const authorLabel = name || (author ? author.substring(0, 10) : 'Someone')
  return authorLabel
}

function formatPushBody(body) {
  if (body && body.trim()) return body.trim()
  return 'Tap to view the latest update'
}

async function toPushPayload(latest, pushIconUrl) {
  const record = latest && typeof latest === 'object' ? latest : null
  const hash = record && typeof record.hash === 'string' ? record.hash : ''
  const explicitUrl = record && typeof record.url === 'string' ? record.url : ''
  const targetUrl = explicitUrl || (hash ? `https://wiredove.net/#${hash}` : 'https://wiredove.net/')
  const rawText = record && typeof record.text === 'string' ? record.text : ''
  const parsed = rawText ? await parsePostText(rawText) : {}
  const bodyText = parsed.body || ''
  if (!bodyText.trim()) return null
  const title = formatPushTitle(parsed.name, record?.author)
  const body = formatPushBody(bodyText)
  return JSON.stringify({
    title,
    body,
    url: targetUrl,
    hash,
    icon: pushIconUrl,
    latest,
  })
}

export async function createNotificationsService(options = {}) {
  const settings = {
    dataDir: DEFAULTS.dataDir,
    subsFile: DEFAULTS.subsFile,
    stateFile: DEFAULTS.stateFile,
    configFile: Deno.env.get('VAPID_CONFIG_PATH') ?? DEFAULTS.configFile,
    vapidSubject: Deno.env.get('VAPID_SUBJECT') ?? DEFAULTS.vapidSubject,
    pushIconUrl: Deno.env.get('PUSH_ICON_URL') ?? DEFAULTS.pushIconUrl,
    ...options,
  }

  await Deno.mkdir(settings.dataDir, { recursive: true })

  const config = await ensureVapidConfig(settings.configFile, settings.vapidSubject)
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  )

  async function loadSubscriptions() {
    return await readJsonFile(settings.subsFile, [])
  }

  async function saveSubscriptions(subs) {
    await writeJsonFile(settings.subsFile, subs)
  }

  async function loadState() {
    return await readJsonFile(settings.stateFile, {})
  }

  async function saveState(state) {
    await writeJsonFile(settings.stateFile, state)
  }

  async function sendPayloadToSubscriptions(payload) {
    const subs = await loadSubscriptions()
    if (subs.length === 0) {
      return { sent: false, reason: 'no subscriptions' }
    }

    const now = new Date().toISOString()
    const nextSubs = []

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          payload,
        )
        nextSubs.push({ ...sub, lastNotifiedAt: now })
      } catch (err) {
        const status = err && typeof err === 'object' ? err.statusCode : undefined
        if (status === 404 || status === 410) {
          console.warn(`Removing expired subscription: ${sub.id}`)
          continue
        }
        console.error(`Push failed for ${sub.id}`, err)
        nextSubs.push(sub)
      }
    }

    await saveSubscriptions(nextSubs)
    return { sent: true }
  }

  async function handleRequest(req) {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/vapid-public-key') {
      return Response.json({ key: config.vapidPublicKey })
    }

    if (req.method === 'POST' && url.pathname === '/subscribe') {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== 'object') {
        return Response.json({ error: 'invalid subscription' }, { status: 400 })
      }

      const sub = body
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return Response.json({ error: 'missing fields' }, { status: 400 })
      }

      const subs = await loadSubscriptions()
      const id = subscriptionId(sub.endpoint)
      const existing = subs.find((item) => item.id === id)
      if (!existing) {
        subs.push({
          id,
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          createdAt: new Date().toISOString(),
        })
        await saveSubscriptions(subs)
      }

      return new Response('ok', { status: 200 })
    }

    if (req.method === 'POST' && url.pathname === '/unsubscribe') {
      const body = await req.json().catch(() => null)
      const endpoint = body?.endpoint
      if (!endpoint) {
        return Response.json({ error: 'missing endpoint' }, { status: 400 })
      }

      const subs = await loadSubscriptions()
      const id = subscriptionId(endpoint)
      const nextSubs = subs.filter((item) => item.id !== id)
      if (nextSubs.length !== subs.length) await saveSubscriptions(nextSubs)

      return new Response('ok', { status: 200 })
    }

    if (req.method === 'POST' && url.pathname === '/push-now') {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== 'object') {
        return Response.json({ error: 'invalid payload' }, { status: 400 })
      }
      const record = {
        hash: typeof body.hash === 'string' ? body.hash : undefined,
        author: typeof body.author === 'string' ? body.author : undefined,
        text: typeof body.text === 'string' ? body.text : undefined,
        url: typeof body.url === 'string' ? body.url : undefined,
      }

      const payload = await toPushPayload(record, settings.pushIconUrl)
      if (!payload) {
        return Response.json({ sent: false, reason: 'no content' })
      }

      if (record.hash) {
        await saveState({ lastSeenId: record.hash })
      }

      const sendResult = await sendPayloadToSubscriptions(payload)
      return Response.json({
        sent: sendResult.sent,
        reason: sendResult.reason,
      })
    }

    return null
  }

  return {
    config,
    handleRequest,
  }
}
