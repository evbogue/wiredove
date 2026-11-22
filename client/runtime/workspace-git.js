const repoPattern = /^[A-Za-z0-9_-]+$/
const kinds = new Set(['overview', 'tree', 'blob', 'refs', 'commits', 'commit', 'diff', 'compare'])

const pathKinds = new Set(['tree', 'blob', 'diff', 'compare'])

const encodePath = path => path.split('/').map(encodeURIComponent).join('/')

export const workspaceGitHref = ({ repo, kind, path = '', rev = null, offset = 0, base, head }) => {
  const prefix = '#workspace/git/' + encodeURIComponent(repo)
  const view = kind === 'overview' ? '' : '/' + kind + (path ? '/' + encodePath(path) : '')
  const query = new URLSearchParams()
  if (rev !== null) query.set('rev', rev)
  if (offset) query.set('offset', offset)
  if (kind === 'compare' && base !== undefined && head !== undefined) {
    query.set('base', base)
    query.set('head', head)
  }
  return prefix + view + (query.size ? '?' + query : '')
}

export function parseWorkspaceGitRoute(route) {
  const prefix = 'workspace/git/'
  if (!route.startsWith(prefix)) return null
  const queryStart = route.indexOf('?', prefix.length)
  const pathname = queryStart === -1 ? route.slice(prefix.length) : route.slice(prefix.length, queryStart)
  const query = queryStart === -1 ? '' : route.slice(queryStart + 1)
  const [repo, kind = 'overview', ...encodedPath] = pathname.split('/')
  if (!repoPattern.test(repo) || !kinds.has(kind)) return null
  let parts
  try { parts = encodedPath.map(decodeURIComponent) } catch { return null }
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes('/') || part.includes('\0'))) return null
  if ((!pathKinds.has(kind) && parts.length) || (['blob', 'diff'].includes(kind) && !parts.length)) return null
  const params = new URLSearchParams(query)
  const request = { repo, kind, path: parts.join('/'), rev: params.get('rev') }
  if (kind === 'commits') request.offset = params.get('offset') || '0'
  if (kind === 'compare') {
    request.base = params.get('base')
    request.head = params.get('head')
    if (!request.base || !request.head) return null
  }
  return request
}

export async function readWorkspaceGit({ repo, kind, path, rev, offset, base, head }, { signal } = {}) {
  if (!repoPattern.test(repo) || !kinds.has(kind)) {
    throw Object.assign(new Error('Invalid repository view'), { status: 400 })
  }
  const query = new URLSearchParams()
  if (path) query.set('path', path)
  if (rev !== null && rev !== undefined) query.set('rev', rev)
  if (kind === 'commits' && offset) query.set('offset', offset)
  if (kind === 'compare') {
    query.set('base', base)
    query.set('head', head)
  }
  const url = '/api/git/' + repo + '/' + kind + (query.size ? '?' + query : '')
  const response = await fetch(url, {
    signal, cache: 'no-store', headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw Object.assign(new Error('Repository request failed'), { status: response.status })
  }
  const data = await response.json()
  const viewValid = {
    refs: () => Array.isArray(data.branches) && Array.isArray(data.tags),
    commits: () => Array.isArray(data.commits) && Number.isInteger(data.offset),
    commit: () => !!data.details && Array.isArray(data.files),
    diff: () => !!data.file,
    compare: () => !!data.base && (path ? !!data.file : Array.isArray(data.files) && Array.isArray(data.commits)),
    blob: () => !!data.file,
  }
  if (!repoPattern.test(data?.repository?.id || '') || typeof data.repository.name !== 'string'
    || !data.revision || (data.revision.commit !== null && !/^[a-f0-9]{40}$/.test(data.revision.commit))
    || typeof data.path !== 'string' || !(viewValid[kind]?.() ?? Array.isArray(data.entries))) {
    throw new Error('Invalid repository response')
  }
  return data
}

export async function readWorkspaceSelection({ signal } = {}) {
  const response = await fetch('/sync/status', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Git status unavailable')
  const { selection } = await response.json()
  if (selection === null) return null
  const { repoId, ref, updateId } = selection
  if (!/^[A-Za-z0-9+/_-]{43}=?$/.test(repoId) || typeof ref !== 'string' || typeof updateId !== 'string') {
    throw new Error('Invalid Git selection')
  }
  return { repo: repoId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), ref, updateId }
}
