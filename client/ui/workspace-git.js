import { h } from 'h'
import { appendFormattedText } from './body.js'
import { readWorkspaceGit, workspaceGitHref } from '../runtime/workspace-git.js'

const text = (tag, value, attrs = {}) => h(tag, { ...attrs, textContent: value })
const link = (label, href) => text('a', label, { href })
const rawPath = /^\/git\/[A-Za-z0-9_-]+\/raw\//
const encodedPath = path => path.split('/').map(encodeURIComponent).join('/')

function breadcrumbs(path, pinnedHref) {
  const nav = h('nav', { classList: 'workspace-git-breadcrumbs' })
  nav.setAttribute('aria-label', 'Repository path')
  nav.append(link('Repository root', pinnedHref('overview')))
  const parts = path ? path.split('/') : []
  parts.forEach((part, index) => {
    nav.append(' / ')
    if (index === parts.length - 1) nav.append(text('span', part))
    else nav.append(link(part, pinnedHref('tree', parts.slice(0, index + 1).join('/'))))
  })
  return nav
}

function listing(data, pinnedHref) {
  if (!data.revision.commit) return text('p', 'This repository has no commits yet.')
  if (!data.entries.length) return text('p', 'This directory is empty.')
  const list = h('ul', { classList: 'workspace-git-entries' })
  for (const entry of data.entries) {
    const label = entry.name + (entry.type === 'tree' ? '/' : '')
    const path = data.path ? data.path + '/' + entry.name : entry.name
    const item = h('li')
    item.append(entry.type === 'tree' || entry.type === 'blob'
      ? link(label, pinnedHref(entry.type, path)) : text('span', label))
    list.append(item)
  }
  return list
}

function preview(file, { readme = false, renderMarkdown } = {}) {
  const section = h('section', { classList: 'workspace-git-preview' })
  if (readme) section.append(text('h3', file.path))
  if (rawPath.test(file.rawUrl || '')) {
    const raw = link('Download raw file', file.rawUrl)
    raw.download = ''
    section.append(raw)
  }
  const message = {
    empty: 'This file is empty.',
    binary: 'Binary file. Download it to view its contents.',
    oversized: 'This file exceeds the preview limit.',
    truncated: 'Showing the beginning of this file.',
  }[file.state]
  if (message) section.append(text('p', message))
  if ((file.state === 'text' || file.state === 'truncated') && typeof file.text === 'string') {
    if (renderMarkdown && file.state === 'text') renderMarkdown(section, file)
    else section.append(h('pre', {}, [text('code', file.text)]))
  }
  return section
}

function render(data, request, href) {
  const { repository, revision } = data
  const pinnedHref = (kind, path = '') => href({ repo: repository.id, kind, path, rev: revision.commit })
  const body = h('div', { classList: 'workspace-git-content' })
  body.append(text('h2', repository.name))
  if (revision.commit) {
    const label = revision.ref || 'Commit'
    const permalink = link(revision.commit.slice(0, 12), pinnedHref(request.kind, data.path))
    permalink.setAttribute('aria-label', 'Permalink at commit ' + revision.commit)
    body.append(h('p', {}, [text('span', label + ' '), permalink]))
  }
  body.append(breadcrumbs(data.path, pinnedHref))
  if (request.kind === 'blob') body.append(preview(data.file))
  else {
    body.append(listing(data, pinnedHref))
    if (data.truncated) body.append(text('p', 'Only the first entries are shown.'))
    if (data.readme) body.append(preview(data.readme, {
      readme: true,
      renderMarkdown: /\.(md|markdown)$/i.test(data.readme.path)
        ? (section, file) => appendFormattedText(section, file.text, {
          hashtags: false,
          resolveLink: value => {
            const match = file.links?.find(item => item.href === value)
            if (match) return pinnedHref(match.kind, match.path)
            return /^(https?:\/\/|mailto:)/i.test(value) ? undefined : null
          },
          resolveMarkdownImage: value => {
            const match = file.links?.find(item => item.href === value && item.kind === 'blob')
            if (!match) return null
            return '/git/' + repository.id + '/raw/' + encodedPath(match.path)
              + '?' + new URLSearchParams({ rev: revision.commit })
          },
        }) : null,
    }))
  }
  return body
}

export function createWorkspaceGitView({
  panel, request, signal, isActive = () => true, readGit = readWorkspaceGit, href = workspaceGitHref,
}) {
  const refresh = text('button', 'Refresh', { type: 'button' })
  const status = h('p')
  status.setAttribute('role', 'status')
  const content = h('div')
  const controls = h('div', { classList: 'workspace-git-controls' }, [link('Repositories', '#workspace/'), refresh])
  panel.replaceChildren(h('section', { classList: 'workspace-git' }, [controls, status, content]))
  let pending = false
  let loaded = false
  const active = () => !signal?.aborted && isActive()
  const load = async () => {
    if (pending || !active()) return
    pending = true
    refresh.setAttribute('aria-disabled', 'true')
    refresh.textContent = 'Refresh'
    status.textContent = loaded ? 'Refreshing repository…' : 'Loading repository…'
    try {
      const data = await readGit(request, { signal })
      if (!active()) return
      content.replaceChildren(render(data, request, href))
      loaded = true
      status.textContent = ''
    } catch (error) {
      if (!active()) return
      refresh.textContent = 'Retry'
      if (loaded) status.textContent = 'Refresh failed. Showing the last loaded revision.'
      else if (error.status === 400) status.textContent = 'This repository link is invalid.'
      else if (error.status === 404) status.textContent = 'Repository, revision, or path not found.'
      else status.textContent = 'Repository data is currently unavailable.'
    } finally {
      pending = false
      refresh.removeAttribute('aria-disabled')
    }
  }
  refresh.addEventListener('click', load)
  void load()
}
