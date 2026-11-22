import { h } from 'https://esm.sh/gh/evbogue/apds@78abedd/lib/h.js'
import { appendFormattedText } from './body.js'
import { getQueueStatusSnapshot, subscribeQueueStatus } from '../../network_queue.js'
import { readWorkspaceGit, readWorkspaceSelection, workspaceGitHref } from '../runtime/workspace-git.js'

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

function linkedList(items, renderItem) {
  return h('ul', { classList: 'workspace-git-entries' }, items.map(item => h('li', {}, [renderItem(item)])))
}

function commitList(commits, commitHref) {
  if (!commits.length) return text('p', 'No commits.')
  return linkedList(commits, item => link(
    [item.hash.slice(0, 12), item.subject || '(No subject)', item.author, item.date?.slice(0, 10)].filter(Boolean).join(' · '),
    commitHref(item.hash)))
}

function changedFiles(files, fileHref) {
  if (!files.length) return text('p', 'No changed files.')
  return linkedList(files, file => link(
    [file.status, file.oldPath ? file.oldPath + ' → ' + file.path : file.path,
      file.binary ? 'Binary' : '+' + file.added + ' −' + file.removed].join(' · '), fileHref(file.path)))
}

function patchView(data) {
  return h('section', { classList: 'workspace-git-preview' }, [
    text('h3', data.path),
    data.patch?.truncated ? text('p', 'Showing the beginning of this diff.') : null,
    data.patch?.text ? h('pre', {}, [text('code', data.patch.text)])
      : text('p', data.file.binary ? 'Binary file changed.' : 'No text changes.'),
  ].filter(Boolean))
}

function compareForm(commit, compareHref, navigate, baseCommit = '') {
  const base = h('input', { name: 'base', required: true, value: baseCommit })
  const head = h('input', { name: 'head', required: true, value: commit || '' })
  const form = h('form', { classList: 'workspace-git-compare-form' }, [
    h('label', {}, ['Base revision ', base]),
    h('label', {}, ['Head revision ', head]),
    text('button', 'Compare', { type: 'submit' }),
  ])
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (base.value.trim() && head.value.trim()) navigate(compareHref(base.value.trim(), head.value.trim()))
  })
  return form
}

function renderRevision(body, data, request, url, navigate) {
  const { revision, details, files } = data
  const commitHref = rev => url('commit', { rev })
  const compareHref = (base, head, path = '') => url('compare', { base, head, path })
  switch (request.kind) {
  case 'refs':
    for (const [label, refs] of [['Branches', data.branches], ['Tags', data.tags]]) {
      body.append(text('h3', label), refs.length
        ? linkedList(refs, item => link(item.name, url('overview', { rev: item.ref })))
        : text('p', 'None published.'))
    }
    body.append(compareForm(revision.commit, compareHref, navigate))
    return true
  case 'commits': {
    body.append(text('h3', 'Commit history'), commitList(data.commits, commitHref))
    const page = offset => url('commits', { rev: revision.commit, offset })
    const controls = h('div', { classList: 'workspace-git-controls' })
    if (data.offset > 0) controls.append(link('Newer commits', page(Math.max(0, data.offset - 50))))
    if (data.hasMore) controls.append(link('Older commits', page(data.offset + 50)))
    body.append(controls)
    return true
  }
  case 'commit': {
    body.append(text('h3', 'Commit message'), text('p', [details.author, details.date].filter(Boolean).join(' · ')),
      h('div', { classList: 'workspace-git-preview' }, [text('pre', details.message || '(No commit message)')]))
    const links = h('div', { classList: 'workspace-git-controls' }, [
      link('Browse at this commit', url('overview', { rev: revision.commit })),
    ])
    for (const parent of details.parents) {
      links.append(link('Parent ' + parent.slice(0, 12), commitHref(parent)))
    }
    const permalink = new URL(commitHref(revision.commit), body.ownerDocument.URL).href
    const share = encodeURIComponent(JSON.stringify({
      url: permalink, title: 'Commit ' + revision.commit.slice(0, 12), appendToDraft: true,
    }))
    links.append(link('Discuss in Social', '#share=' + share))
    body.append(links, text('h3', 'Changed files'),
      changedFiles(files, path => url('diff', { rev: revision.commit, path })))
    return true
  }
  case 'diff':
    body.append(link('Back to commit', commitHref(revision.commit)), patchView(data))
    if (data.file.newMode !== '000000' && data.file.newMode !== '160000') {
      body.append(link('Browse file at this commit', url('blob', { rev: revision.commit, path: data.path })))
    }
    return true
  case 'compare':
    body.append(text('h3', 'Compare revisions'), compareForm(revision.commit, compareHref, navigate, data.base.commit),
      h('p', {}, [link(data.base.commit.slice(0, 12), commitHref(data.base.commit)), ' → ',
        link(revision.commit.slice(0, 12), commitHref(revision.commit))]))
    if (data.path) {
      body.append(link('Back to comparison', compareHref(data.base.commit, revision.commit)), patchView(data))
    } else {
      body.append(text('h4', `Commits (${data.totalCommits})`), commitList(data.commits, commitHref),
        text('h4', `Changed files (${data.totalFiles})`),
        changedFiles(files, path => compareHref(data.base.commit, revision.commit, path)))
      if (data.truncated || data.commits.length < data.totalCommits) {
        body.append(text('p', 'Showing the first results.'))
      }
    }
    return true
  default:
    return false
  }
}

function render(data, request, href, navigate) {
  const { repository, revision } = data
  const url = (kind, options = {}) => href({ repo: repository.id, kind, ...options })
  const pinnedHref = (kind, path = '') => url(kind, { path, rev: revision.commit })
  const body = h('div', { classList: 'workspace-git-content' })
  const heading = h('header', { classList: 'workspace-item-header' }, [text('h2', repository.name)])
  body.append(heading)
  if (revision.commit) {
    const label = revision.ref || 'Commit'
    const pinnedView = request.kind === 'compare'
      ? url('compare', { path: data.path, base: data.base.commit, head: revision.commit })
      : url(request.kind, { path: data.path, rev: revision.commit, offset: data.offset })
    const permalink = link(revision.commit.slice(0, 12), pinnedView)
    permalink.setAttribute('aria-label', 'Permalink at commit ' + revision.commit)
    body.append(h('p', {}, [text('span', label + ' '), permalink]))
  }
  const menu = h('nav', { classList: 'workspace-git-controls' }, [
    link('Latest commit in view', pinnedHref('commit')),
  ])
  menu.setAttribute('aria-label', 'Repository views')
  body.append(menu)
  if (request.kind === 'overview') {
    const clone = new URL('/git/' + encodeURIComponent(repository.id) + '.git', body.ownerDocument.URL).href
    const result = h('span')
    result.setAttribute('role', 'status')
    const copy = text('button', 'Copy clone URL', { type: 'button' })
    const cloneDetails = h('details', {}, [text('summary', 'Clone URL'), h('code', { textContent: clone })])
    copy.addEventListener('click', async () => {
      try {
        await body.ownerDocument.defaultView.navigator.clipboard.writeText(clone)
        result.textContent = 'Copied.'
      } catch { cloneDetails.open = true; result.textContent = 'Select the URL to copy it.' }
    })
    heading.append(copy)
    body.append(cloneDetails, result)
  }
  if (renderRevision(body, data, request, url, navigate)) return body
  body.append(breadcrumbs(data.path, pinnedHref))
  if (request.kind === 'blob') {
    const copy = text('button', 'Copy path', { type: 'button' })
    copy.addEventListener('click', async () => {
      try {
        await body.ownerDocument.defaultView.navigator.clipboard.writeText(data.path)
        copy.textContent = 'Path copied'
      } catch { copy.textContent = 'Copy the path from the breadcrumb' }
    })
    const file = preview(data.file)
    const raw = file.querySelector('a[download]')
    body.append(h('div', { classList: 'workspace-item-header' }, [copy, raw].filter(Boolean)), file)
  }
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

export function createWorkspaceSyncView({ panel, signal, isActive, refreshSocial, transportControls, onSelection, session, onAvailability }) {
  const status = h('p')
  status.setAttribute('role', 'status')
  const selection = h('dl')
  const queue = h('p')
  const updateQueue = state => {
    queue.textContent = `Browser peer transport: ${state.wsReady || state.gossipReady ? 'connected' : 'disconnected'}. ${state.total} queued.`
  }
  updateQueue(getQueueStatusSnapshot())
  const unsubscribe = subscribeQueueStatus(updateQueue)
  signal.addEventListener('abort', unsubscribe, { once: true })
  const refresh = text('button', 'Refresh Git status', { type: 'button' })
  const social = text('button', 'Refresh Social archive', { type: 'button' })
  const socialStatus = h('p')
  socialStatus.setAttribute('role', 'status')
  social.addEventListener('click', async () => {
    social.disabled = true
    socialStatus.textContent = 'Refreshing Social archive…'
    try {
      await refreshSocial()
      if (isActive()) socialStatus.textContent = 'Social archive refreshed.'
    } catch {
      if (isActive()) socialStatus.textContent = 'Social archive unavailable. Retry refresh.'
    } finally { social.disabled = false }
  })
  const load = async () => {
    refresh.disabled = true
    status.textContent = 'Loading Git selection…'
    try {
      const data = await readWorkspaceSelection({ signal })
      if (!isActive()) return
      selection.replaceChildren()
      onAvailability?.(true)
      onSelection?.(data)
      if (data) {
        const { repo, ref, updateId } = data
        selection.append(text('dt', 'Repository'),
          h('dd', {}, [link(repo, workspaceGitHref({ repo, kind: 'overview' }))]),
          text('dt', 'Branch'), text('dd', ref), text('dt', 'Update'), text('dd', updateId))
        status.textContent = ''
      } else status.textContent = 'No repository selected.'
    } catch {
      if (isActive()) {
        onAvailability?.(false)
        status.textContent = selection.childElementCount
          ? 'Refresh failed. Showing the last known Git selection.'
          : 'Git status unavailable. Retry refresh.'
      }
    } finally { refresh.disabled = false }
  }
  refresh.addEventListener('click', load)
  const retry = []
  if (session?.artifacts) {
    const status = h('p')
    status.setAttribute('role', 'status')
    const button = text('button', 'Retry pending publication', { type: 'button', hidden: true })
    const update = async () => {
      try { button.hidden = !(await session.artifacts.pending()).length } catch {}
    }
    button.addEventListener('click', async () => {
      button.disabled = true
      try { await session.retry(); status.textContent = 'Delivery confirmed.' }
      catch (error) { status.textContent = error.message }
      finally { button.disabled = false; void update() }
    })
    void update()
    const timer = setInterval(update, 1000)
    signal.addEventListener('abort', () => clearInterval(timer), { once: true })
    retry.push(button, status)
  }
  panel.replaceChildren(h('section', { classList: 'workspace-git' }, [
    text('h1', 'Sync'),
    text('h2', 'Server Git selection'), refresh, status, selection,
    text('h2', 'Browser Social sync'), queue, social, socialStatus, ...retry,
    ...(transportControls ? [transportControls({ signal, isActive })] : []),
  ]))
  void load()
}

export function createWorkspaceGitView({
  panel, request, signal, onRevision, isActive = () => true, readGit = readWorkspaceGit, href = workspaceGitHref,
  navigate = target => { panel.ownerDocument.defaultView.location.hash = target },
}) {
  const refresh = text('button', 'Refresh', { type: 'button' })
  const status = h('p')
  status.setAttribute('role', 'status')
  const content = h('div')
  const controls = h('div', { classList: 'workspace-git-controls' }, [refresh])
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
      content.replaceChildren(render(data, request, href, navigate))
      onRevision?.(data.revision.commit)
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
