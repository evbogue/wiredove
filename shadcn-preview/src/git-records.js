import { isMessageHash } from '../../client/protocol.js'
import { gitHref } from './git-route.js'

export function gitCardType(parsed) {
  if (parsed?.anbot !== 1) return null
  if (parsed.type === 'git-repo' && typeof parsed.name === 'string' && parsed.name.trim()) return 'Repository'
  const push = parsed.type === 'git-push'
  const update = parsed.type === 'git-update' && parsed.repo?.format === 'anproto'
  const repoId = push ? parsed.repoId : parsed.repo?.id
  if ((!push && !update) || !isMessageHash(repoId) || !/^[a-f0-9]{40}$/.test(parsed.commit)
    || typeof parsed.ref !== 'string' || !parsed.ref.startsWith('refs/heads/')) return null
  if (push) return 'Git push'
  return parsed.pushId ? null : 'Published revision'
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
  const commit = parsed.type === 'git-repo' ? null : parsed.commit
  const repo = id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return {
    id,
    repo,
    repository: gitHref({ repo, kind: 'overview' }),
    revision: commit && gitHref({ repo, kind: 'commit', rev: commit }),
    comparison: post.gitBase && gitHref({ repo, kind: 'compare', base: post.gitBase, head: commit }),
  }
}

export function withGitActivity(records) {
  const posts = new Map([...records.values()].filter(post => gitCardType(post.parsed)).map(post => [post.id, post]))
  const updates = new Map([...records].filter(([, { parsed, author }]) =>
    parsed.type === 'git-update' && parsed.repo?.format === 'anproto'
    && gitCardType({ ...parsed, pushId: null }) === 'Published revision'
    && records.get(parsed.repo.id)?.author === author
    && gitCardType(records.get(parsed.repo.id)?.parsed) === 'Repository'))
  const superseded = new Set()
  for (const [id, update] of updates) {
    const { repo, previous, ref, commit, pushId } = update.parsed
    const base = updates.get(previous)?.parsed
    const sameBranch = base?.repo.id === repo.id && base.ref === ref
    if (sameBranch) superseded.add(previous)
    const receipt = records.get(pushId)
    const push = receipt?.push
    if (receipt?.author === update.author && push?.parsed.repoId === repo.id
      && push.parsed.ref === ref && push.parsed.commit === commit) {
      posts.set(push.id, { ...push, gitBase: sameBranch && previous !== id ? base.commit : undefined })
    }
  }
  for (const [id, update] of updates) {
    if (superseded.has(id)) continue
    const repo = posts.get(update.parsed.repo.id)
    posts.set(repo.id, { ...repo, gitRef: update.parsed.ref })
  }
  return [...posts.values()]
}
