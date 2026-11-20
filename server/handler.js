import * as fs from 'node:fs/promises'
import { env as processEnv, cwd } from 'node:process'
import { resolve } from 'node:path'
import { createNotificationsService } from '../notifications_server.js'
import { createAndFsMediaService } from '../andfs_media_server.js'
import { createApplicationBackend } from '../application_backend.js'
import { createStaticHandler } from './static.js'

const workspaceGitRead = /^\/api\/git\/[A-Za-z0-9_-]+\/(overview|tree|blob|refs|commits|commit|diff|compare)$/
const workspaceGitRaw = /^\/git\/[A-Za-z0-9_-]+\/raw\/.+/

function workspaceGitPage(url) {
  if (url.pathname === '/git' || url.pathname === '/git/') return 'workspace/'
  const scope = /^\/git\/([A-Za-z0-9_-]+)(\/.*)?$/.exec(url.pathname)
  if (!scope) return null
  const [, repo, rest = ''] = scope
  const query = new URLSearchParams()
  let view = ''
  const revision = url.searchParams.get('rev')
  if (revision !== null) query.set('rev', revision)
  const commit = /^\/commit\/([0-9a-f]{40})(?:\/(blob|diff)\/(.+))?$/.exec(rest)
  const compare = /^\/compare\/(.+?)\.\.\.(.+)$/.exec(rest)
  if (commit) {
    view = '/' + (commit[2] || 'commit') + (commit[3] ? '/' + commit[3] : '')
    query.set('rev', commit[1])
  } else if (compare) {
    view = '/compare'
    query.delete('rev')
    query.set('base', decodeURIComponent(compare[1]))
    query.set('head', decodeURIComponent(compare[2]))
    const path = url.searchParams.get('diff')
    if (path) view += '/' + path.split('/').map(encodeURIComponent).join('/')
  } else if (/^\/(refs|commits|tree(?:\/.+)?|blob\/.+)$/.test(rest)) {
    view = rest
    const offset = url.searchParams.get('offset')
    if (rest === '/commits' && offset !== null) query.set('offset', offset)
  } else if (rest !== '' && rest !== '/') return null
  return 'workspace/git/' + repo + view + (query.size ? '?' + query : '')
}

function createWorkspaceGitGateway(value) {
  if (!value) return null
  const upstream = new URL(value)
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.href !== upstream.origin + '/') {
    throw new Error('WORKSPACE_GIT_UPSTREAM must be an HTTP(S) origin')
  }
  return async request => {
    const url = new URL(request.url)
    if (['GET', 'HEAD'].includes(request.method)) {
      const page = workspaceGitPage(url)
      if (page) {
        const target = new URL('/', url.origin)
        target.hash = page
        return Response.redirect(target, 307)
      }
    }
    const raw = workspaceGitRaw.test(url.pathname) || /^\/git\/[A-Za-z0-9_-]+\/commit\/[0-9a-f]{40}\/raw\/.+/.test(url.pathname)
    if (!raw && url.pathname !== '/sync/status' && !workspaceGitRead.test(url.pathname)) return null
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
    }
    const headers = new Headers({
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    })
    try {
      const response = await fetch(new URL(url.pathname + url.search, upstream.origin), {
        redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
        headers: { accept: raw ? '*/*' : 'application/json' },
      })
      const type = response.headers.get('content-type')
      if (raw) {
        headers.set('content-security-policy', 'sandbox')
        headers.set('content-type', response.ok && type ? type : 'application/octet-stream')
      } else {
        headers.set('content-type', 'application/json')
        if (response.ok && !type?.startsWith('application/json')) {
          await response.body?.cancel()
          return new Response(null, { status: 502, headers })
        }
      }
      if (request.method === 'HEAD') await response.body?.cancel()
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers })
    } catch {
      return new Response(null, { status: 503, headers })
    }
  }
}

// Both listeners use this exact route graph and on-disk formats.
export async function createWiredoveHandler({ env = processEnv, root = cwd(), notificationsOptions = {} } = {}) {
  const workspaceGit = createWorkspaceGitGateway(env.WORKSPACE_GIT_UPSTREAM)
  root = await fs.realpath(root)
  const dataDir = resolve(root, env.DATA_DIR || './data')
  const applicationDir = resolve(root, env.APPLICATION_DATA_DIR || `${dataDir}/application`)
  const blobDir = resolve(root, env.BLOB_DIR || `${dataDir}/blobs`)
  const mediaDir = resolve(root, env.MEDIA_DATA_DIR || dataDir)
  const configFile = resolve(root, env.VAPID_CONFIG_PATH || './config.json')
  const application = await createApplicationBackend({ dataDir: applicationDir })
  const notifications = await createNotificationsService({
    dataDir, subsFile: `${dataDir}/subscriptions.json`, stateFile: `${dataDir}/state.json`, configFile,
    vapidSubject: env.VAPID_SUBJECT, pushIconUrl: env.PUSH_ICON_URL, feedRowsUpstream: env.FEED_ROWS_UPSTREAM,
    ...notificationsOptions,
  })
  const media = await createAndFsMediaService({ dataDir: mediaDir,
    maxMediaBytes: Number(env.MEDIA_MAX_BYTES || 32 * 1024 * 1024),
    quotaBytes: Number(env.MEDIA_QUOTA_BYTES || 1024 * 1024 * 1024) })
  await fs.mkdir(blobDir, { recursive: true })
  const privatePaths = [dataDir, applicationDir, blobDir, mediaDir, configFile]
  // A configured data directory may itself be a symlink within the checkout.
  privatePaths.push(...await Promise.all(privatePaths.map(path => fs.realpath(path).catch(() => path))))
  const staticFiles = createStaticHandler({ root, privatePaths })
  const legacyBlob = async request => {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/blobs/')) return null
    let id
    try { id = decodeURIComponent(url.pathname.slice('/blobs/'.length)) }
    catch { return new Response('bad blob id', { status: 400 }) }
    if (!/^anblob:v1:(raw|chunked):sha256:[A-Za-z0-9_-]+$/.test(id)) return new Response('bad blob id', { status: 400 })
    const file = `${blobDir}/${encodeURIComponent(id)}`
    if (request.method === 'PUT') {
      const bytes = new Uint8Array(await request.arrayBuffer())
      const temp = `${file}.${crypto.randomUUID()}.tmp`
      try { await fs.writeFile(temp, bytes); await fs.rename(temp, file) }
      finally { await fs.unlink(temp).catch(() => {}) }
      return new Response(null, { status: 204 })
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD, PUT' } })
    try {
      const stat = await fs.stat(file)
      return new Response(request.method === 'HEAD' ? null : await fs.readFile(file), { headers: {
        'access-control-allow-origin': '*', 'content-type': 'application/octet-stream', 'content-length': String(stat.size), 'cache-control': 'public, max-age=31536000, immutable' } })
    } catch (error) { if (error.code === 'ENOENT') return new Response(null, { status: 404 }); throw error }
  }
  return async request => {
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url).pathname) }
    catch { return new Response(null, { status: 400 }) }
    if (/^\/(?:data(?:\/|$)|config\.json$|\.git(?:\/|$))/.test(pathname)) return new Response(null, { status: 404 })
    const git = await workspaceGit?.(request)
    if (git) return git
    for (const service of [application.handleRequest, media.handleRequest, legacyBlob, notifications.handleRequest]) {
      const response = await service(request)
      if (response) return response
    }
    const response = await staticFiles(request)
    if (pathname.startsWith('/dist/app-v1/') || pathname === '/app-embed.js' || pathname.startsWith('/client/') || pathname.startsWith('/vendor/') || ['/embed.js', '/style.css'].includes(pathname)) response.headers.set('access-control-allow-origin', '*')
    return response
  }
}
