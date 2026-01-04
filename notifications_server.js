import webpush from 'npm:web-push@3.6.7'
import { apds } from 'https://esm.sh/gh/evbogue/apds@d9326cb/apds.js'

const DEFAULTS = {
  latestUrl: 'https://pub.wiredove.net/latest',
  pollMs: 15000,
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

async function hashText(text) {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
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

  const body = bodyText.trim() || (yamlBody || '').trim()

  return {
    name: name || undefined,
    body: body || undefined,
  }
}

function formatPushTitle(name, author) {
  const authorLabel = name || (author ? author.substring(0, 10) : 'Someone')
  return `New Wiredove Message from ${authorLabel}`
}

function formatPushBody(body) {
  if (body && body.trim()) return body.trim()
  return 'Tap to view the latest update'
}

async function toPushPayload(latest, pushIconUrl) {
  const record = latest && typeof latest === 'object' ? latest : null
  const hash = record && typeof record.hash === 'string' ? record.hash : ''
  const targetUrl = hash ? `https://wiredove.net/#${hash}` : 'https://wiredove.net/'
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

function summarizeLatest(record) {
  const text = typeof record.text === 'string' ? record.text : ''
  const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text
  return {
    hash: typeof record.hash === 'string' ? record.hash : undefined,
    author: typeof record.author === 'string' ? record.author : undefined,
    ts: typeof record.ts === 'string' ? record.ts : undefined,
    textPreview: preview || undefined,
  }
}

export async function createNotificationsService(options = {}) {
  const settings = {
    latestUrl: Deno.env.get('LATEST_URL') ?? DEFAULTS.latestUrl,
    pollMs: Number(Deno.env.get('POLL_MS') ?? DEFAULTS.pollMs),
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

  async function pollLatest(force = false) {
    try {
      const res = await fetch(settings.latestUrl, { cache: 'no-store' })
      if (!res.ok) {
        console.error(`Latest fetch failed: ${res.status}`)
        return { changed: false, sent: false, reason: 'latest fetch failed' }
      }
      const bodyText = await res.text()
      if (!bodyText.trim()) {
        return { changed: false, sent: false, reason: 'empty response' }
      }

      let latestId = ''
      let latestJson = bodyText
      let latestRecord = null

      try {
        latestJson = JSON.parse(bodyText)
        if (Array.isArray(latestJson)) {
          if (latestJson.length === 0) {
            return { changed: false, sent: false, reason: 'empty response' }
          }
          const sorted = [...latestJson]
            .filter((item) => item && typeof item === 'object')
            .sort((a, b) => {
              const at = Number(a.ts ?? a.timestamp ?? 0)
              const bt = Number(b.ts ?? b.timestamp ?? 0)
              if (!Number.isNaN(bt - at)) return bt - at
              return 0
            })
          latestRecord = sorted[0] ?? null
        } else if (latestJson && typeof latestJson === 'object') {
          latestRecord = latestJson
        }

        if (latestRecord) {
          const candidate =
            latestRecord.hash ??
            latestRecord.sig ??
            latestRecord.id ??
            latestRecord.timestamp ??
            latestRecord.ts
          if (typeof candidate === 'string' || typeof candidate === 'number') {
            latestId = String(candidate)
          }
        }
      } catch {
        // Non-JSON is allowed; fallback to hashing.
      }

      const state = await loadState()
      const latestHash = latestId ? '' : await hashText(bodyText)
      const latestSummary = latestRecord ? summarizeLatest(latestRecord) : undefined

      const isNew = latestId
        ? latestId !== state.lastSeenId
        : latestHash !== state.lastSeenHash

      if (!isNew && !force) {
        return {
          changed: false,
          sent: false,
          reason: 'no new messages',
          latest: latestSummary,
        }
      }

      if (isNew) {
        await saveState({
          lastSeenId: latestId || undefined,
          lastSeenHash: latestHash || undefined,
        })
      }

      const subs = await loadSubscriptions()
      if (subs.length === 0) {
        return {
          changed: true,
          sent: false,
          reason: 'no subscriptions',
          latest: latestSummary,
        }
      }

      const payload = await toPushPayload(latestRecord ?? latestJson, settings.pushIconUrl)
      if (!payload) {
        return {
          changed: false,
          sent: false,
          reason: 'no content',
          latest: latestSummary,
        }
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
      return { changed: true, sent: true, latest: latestSummary }
    } catch (err) {
      console.error('Poll error', err)
      return { changed: false, sent: false, reason: 'poll error' }
    }
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

    if (req.method === 'POST' && url.pathname === '/poll-now') {
      const result = await pollLatest()
      return Response.json(result)
    }

    if (req.method === 'POST' && url.pathname === '/push-latest') {
      const result = await pollLatest(true)
      return Response.json(result)
    }

    return null
  }

  function startPolling() {
    console.log(`Polling ${settings.latestUrl} every ${settings.pollMs}ms`)
    pollLatest()
    setInterval(() => {
      pollLatest()
    }, settings.pollMs)
  }

  return {
    config,
    handleRequest,
    pollLatest,
    startPolling,
  }
}
