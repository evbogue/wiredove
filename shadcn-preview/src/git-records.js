import { isMessageHash } from '../../client/protocol.js'
import { workspaceGitHref } from '../../client/runtime/workspace-git.js'

export function gitCardType(parsed) {
  if (parsed?.anbot !== 1) return null
  if (parsed.type === 'git-repo' && typeof parsed.name === 'string' && parsed.name.trim()) return 'Repository'
  const push = parsed.type === 'git-push'
  const update = parsed.type === 'git-update' && parsed.repo?.format === 'anproto' && !parsed.pushId
  const repoId = push ? parsed.repoId : parsed.repo?.id
  if ((!push && !update) || !isMessageHash(repoId) || !/^[a-f0-9]{40}$/.test(parsed.commit)
    || typeof parsed.ref !== 'string' || !parsed.ref.startsWith('refs/heads/')) return null
  return push ? 'Git push' : 'Published revision'
}

export function gitRepositoryId({ id, parsed }) {
  switch (parsed.type) {
    case 'git-repo': return id
    case 'git-push': return parsed.repoId
    case 'git-update': return parsed.repo?.id
    default: return undefined
  }
}

export function gitCardLinks(post) {
  const { parsed } = post
  const id = gitRepositoryId(post)
  const repo = id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return {
    id,
    repo,
    repository: workspaceGitHref({ repo, kind: 'overview' }),
    revision: parsed.commit && workspaceGitHref({ repo, kind: 'commit', rev: parsed.commit }),
  }
}
