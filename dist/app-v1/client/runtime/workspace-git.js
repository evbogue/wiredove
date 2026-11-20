const repoPattern = /^[A-Za-z0-9_-]+$/
const kinds = new Set(['overview', 'tree', 'blob'])

const encodePath = path => path.split('/').map(encodeURIComponent).join('/')

export const workspaceGitHref = ({ repo, kind, path = '', rev = null }) => {
  const base = '#workspace/git/' + encodeURIComponent(repo)
  const view = kind === 'overview' ? '' : '/' + kind + (path ? '/' + encodePath(path) : '')
  const query = rev === null ? '' : '?' + new URLSearchParams({ rev })
  return base + view + query
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
  if ((kind === 'overview' && parts.length) || (kind === 'blob' && !parts.length)) return null
  return { repo, kind, path: parts.join('/'), rev: new URLSearchParams(query).get('rev') }
}

export async function readWorkspaceGit({ repo, kind, path, rev }, { signal } = {}) {
  if (!repoPattern.test(repo) || !kinds.has(kind)) {
    throw Object.assign(new Error('Invalid repository view'), { status: 400 })
  }
  const query = new URLSearchParams()
  if (path) query.set('path', path)
  if (rev !== null && rev !== undefined) query.set('rev', rev)
  const url = '/api/git/' + repo + '/' + kind + (query.size ? '?' + query : '')
  const response = await fetch(url, {
    signal, cache: 'no-store', headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw Object.assign(new Error('Repository request failed'), { status: response.status })
  }
  const data = await response.json()
  if (!repoPattern.test(data?.repository?.id || '') || typeof data.repository.name !== 'string'
    || !data.revision || (data.revision.commit !== null && !/^[a-f0-9]{40}$/.test(data.revision.commit))
    || typeof data.path !== 'string' || (kind === 'blob' ? !data.file : !Array.isArray(data.entries))) {
    throw new Error('Invalid repository response')
  }
  return data
}
