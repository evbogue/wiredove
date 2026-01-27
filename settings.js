import { h } from 'h'
import { apds } from 'apds'
import { nameDiv, avatarSpan } from './profile.js'
import { clearQueue, getQueueSize, queueSend } from './network_queue.js'
import { addBlockedAuthor, getModerationState, removeBlockedAuthor, saveModerationState, splitTextList } from './moderation.js'

const isHash = (value) => typeof value === 'string' && value.length === 44

export const importKey = async () => {
  const textarea = h('textarea', {placeholder: 'Keypair'})

  const button = h('button', {
    onclick: async () => {
      const trashkey = await apds.generate()
      if (textarea.value && textarea.value.length === trashkey.length) {
        await apds.put('keypair', textarea.value)
        window.location.hash = '#'
        location.reload()
      } else { alert('Invalid Keypair')}
    }
  }, ['Import key'])

  const div = h('div', {classList: 'message'}, [
    textarea, 
    button,
    deleteEverything
  ]) 

  return div 
} 

const editKey = async () => {
  const textarea = h('textarea', [await apds.keypair()])
  const span = h('span', [
    textarea,
    h('button', {
      onclick: async () => {
        const keypair = await apds.keypair()
        if (textarea.value.length === keypair.length) {
          await apds.put('keypair', textarea.value)
          window.location.hash = '#'
          location.reload()
        } else { alert('Invalid Keypair')}
      }
    }, ['Import key']),
    h('button', {
      onclick: async () => {
        await apds.deletekey()
        window.location.hash = '#'
        location.reload()
      }
    }, ['Delete key']),
  ])
  return span
} 

const deleteEverything = h('button', {
  onclick: async () => {
    await apds.clear()
    window.location.hash = '#'
    location.reload()
  }
}, ['Delete everything'])

let batchTotal = 0
let batchTarget = 0
let batchStartSize = 0
let queueTicker = null

const updateQueueUi = () => {
  const size = getQueueSize()
  if (batchTotal > 0) {
    const done = Math.min(batchTotal, Math.max(0, batchTarget - size))
    queueLabel.textContent = `Queue: ${size} | Push: ${done}/${batchTotal}`
    queueProgress.max = batchTotal
    queueProgress.value = done
  } else {
    queueLabel.textContent = `Queue: ${size}`
    queueProgress.max = 1
    queueProgress.value = 0
  }
}

const queueLabel = h('div', {classList: 'queue-status'}, ['Queue: 0'])
const queueProgress = h('progress', {classList: 'queue-progress', max: 1, value: 0})
const cancelQueue = h('button', {
  onclick: () => {
    clearQueue()
    batchTotal = 0
    batchTarget = 0
    batchStartSize = 0
    updateQueueUi()
  }
}, ['Cancel queue'])

const queuePanel = h('div', {classList: 'queue-panel'}, [
  queueLabel,
  queueProgress,
  cancelQueue
])

const pullEverything = h('button', {
  onclick: async () => {
    const remotelog = await fetch('https://pub.wiredove.net/all').then(l => l.json())
    for (const m of remotelog) {
      if (m && m.sig) {
        await apds.add(m.sig)
        await apds.make(m.text)
      }
    }
  }
}, ['Pull everything'])

const pushEverything = h('button', {
  onclick: async () => {
    batchStartSize = getQueueSize()
    batchTotal = 0
    const log = await apds.query()
    if (log) {
      const ar = []
      for (const msg of log) {
        if (isHash(msg.hash) && queueSend(msg.hash)) { batchTotal += 1 }
        if (msg.text) {
          const yaml = await apds.parseYaml(msg.text)
          if (isHash(yaml.image) && !ar.includes(yaml.image)) {
            if (queueSend(yaml.image)) { batchTotal += 1 }
            ar.push(yaml.image)
          }
          if (yaml.body) {
            const images = yaml.body.match(/!\[.*?\]\((.*?)\)/g)
            if (images) {
              for (const image of images) {
                const src = image.match(/!\[.*?\]\((.*?)\)/)[1]
                if (isHash(src) && !ar.includes(src)) {
                  if (queueSend(src)) { batchTotal += 1 }
                  ar.push(src)
                }
              }
            }
          }
        }
        if (!msg.text) {
          const contentHash = msg.opened?.substring(13)
          if (isHash(contentHash) && queueSend(contentHash)) { batchTotal += 1 }
        }
      }
    }
    batchTarget = batchStartSize + batchTotal
    updateQueueUi()
  }
}, ['Push everything'])

const moderationPanel = async () => {
  const container = h('div', {classList: 'moderation-panel'})

  const fetchAuthorLabel = async (author) => {
    if (!author) { return 'Unknown author' }
    let label = author.substring(0, 10)
    try {
      const query = await apds.query(author)
      const entry = Array.isArray(query) ? query[0] : query
      if (entry && entry.opened) {
        const content = await apds.get(entry.opened.substring(13))
        if (content) {
          const yaml = await apds.parseYaml(content)
          if (yaml && yaml.name) {
            label = `${yaml.name} (${author.substring(0, 6)})`
          }
        }
      }
    } catch {}
    return label
  }

  const fetchHiddenLabel = async (hash) => {
    if (!hash) { return 'Unknown message' }
    let label = hash.substring(0, 10)
    try {
      const blob = await apds.get(hash)
      let author = blob ? blob.substring(0, 44) : null
      let opened = null
      if (blob) {
        opened = await apds.open(blob)
      }
      const authorLabel = author ? await fetchAuthorLabel(author) : 'Unknown author'
      let snippet = ''
      if (opened) {
        const content = await apds.get(opened.substring(13))
        if (content) {
          const yaml = await apds.parseYaml(content)
          if (yaml && yaml.body) {
            snippet = yaml.body.replace(/\s+/g, ' ').trim().substring(0, 32)
          }
        }
      }
      if (snippet) {
        label = `${authorLabel} · ${snippet}`
      } else {
        label = `${authorLabel} · ${hash.substring(0, 10)}`
      }
    } catch {}
    return label
  }

  const createTag = ({ label, onRemove }) => {
    const text = h('span', {classList: 'moderation-tag-label'}, [label])
    const remove = h('button', {
      classList: 'moderation-tag-remove',
      onclick: onRemove
    }, ['×'])
    return h('span', {classList: 'moderation-tag'}, [text, remove])
  }

  const buildSection = async ({
    title,
    placeholder,
    items,
    onAdd,
    onRemove,
    labelForItem
  }) => {
    const input = h('input', {
      classList: 'moderation-input',
      placeholder
    })
    const addButton = h('button', {
      onclick: async () => {
        const value = input.value.trim()
        if (!value) { return }
        input.value = ''
        await onAdd(value)
        await renderPanel()
      }
    }, ['Add'])

    const list = h('div', {classList: 'moderation-tags'})
    for (const item of items) {
      const tag = createTag({
        label: item,
        onRemove: async () => {
          await onRemove(item)
          await renderPanel()
        }
      })
      list.appendChild(tag)
      if (labelForItem) {
        labelForItem(item).then((label) => {
          const labelEl = tag.querySelector('.moderation-tag-label')
          if (labelEl) { labelEl.textContent = label }
        })
      }
    }

    return h('div', {classList: 'moderation-section'}, [
      h('div', {classList: 'moderation-section-title'}, [title]),
      h('div', {classList: 'moderation-row'}, [input, addButton]),
      list
    ])
  }

  const renderPanel = async () => {
    const state = await getModerationState()
    while (container.firstChild) { container.firstChild.remove() }

    container.appendChild(h('p', {classList: 'moderation-note'}, [
      'Local-only: saved in your browser and never broadcast.'
    ]))

    container.appendChild(await buildSection({
      title: 'Muted authors',
      placeholder: 'Add author pubkey',
      items: state.mutedAuthors,
      onAdd: async (value) => {
        await saveModerationState({
          ...state,
          mutedAuthors: splitTextList([...state.mutedAuthors, value].join('\n'))
        })
      },
      onRemove: async (value) => {
        await saveModerationState({
          ...state,
          mutedAuthors: state.mutedAuthors.filter(item => item !== value)
        })
      },
      labelForItem: fetchAuthorLabel
    }))

    container.appendChild(await buildSection({
      title: 'Blocked authors',
      placeholder: 'Add author pubkey',
      items: state.blockedAuthors,
      onAdd: async (value) => {
        window.__feedStatus?.('Blocking author…', { sticky: true })
        const result = await addBlockedAuthor(value)
        const removed = result?.purge?.removed ?? 0
        const blobs = result?.purge?.blobs ?? 0
        if (result?.purge) {
          window.__feedStatus?.(`Blocked author. Removed ${removed} post${removed === 1 ? '' : 's'}, ${blobs} blob${blobs === 1 ? '' : 's'}.`)
        } else {
          window.__feedStatus?.('Blocked author.')
        }
        setTimeout(() => {
          location.reload()
        }, 600)
      },
      onRemove: async (value) => {
        await removeBlockedAuthor(value)
      },
      labelForItem: fetchAuthorLabel
    }))

    container.appendChild(await buildSection({
      title: 'Hidden posts',
      placeholder: 'Add message hash',
      items: state.hiddenHashes,
      onAdd: async (value) => {
        await saveModerationState({
          ...state,
          hiddenHashes: splitTextList([...state.hiddenHashes, value].join('\n'))
        })
      },
      onRemove: async (value) => {
        await saveModerationState({
          ...state,
          hiddenHashes: state.hiddenHashes.filter(item => item !== value)
        })
      },
      labelForItem: fetchHiddenLabel
    }))

    container.appendChild(await buildSection({
      title: 'Filtered keywords',
      placeholder: 'Add keyword',
      items: state.mutedWords,
      onAdd: async (value) => {
        await saveModerationState({
          ...state,
          mutedWords: splitTextList([...state.mutedWords, value].join('\n'))
        })
      },
      onRemove: async (value) => {
        await saveModerationState({
          ...state,
          mutedWords: state.mutedWords.filter(item => item !== value)
        })
      }
    }))
  }

  await renderPanel()
  return container
}


//const didweb = async () => {
//  const input = h('input', {placeholder: 'https://yourwebsite.com/'})
//  const get = await apds.get('didweb')
//  if (get) {input.placeholder = get}
//
//  return h('div', [
//    input,
//    h('button', {onclick: async () => {
//      if (input.value) {
//        const check = await fetch(input.value + '/keys', {
//          method: 'get',
//          mode: 'no-cors',
//          headers: {
//            'Access-Control-Allow-Origin' : '*'
//          }
//        })
//        if (check) { console.log(await check.text()) }
//      }
//    }}, ['Verify'])
//  ])
//}

export const settings = async () => {
  if (!queueTicker) {
    updateQueueUi()
    queueTicker = setInterval(updateQueueUi, 500)
  }
  const div = h('div', {classList: 'message'}, [
    h('p', ['Upload photo']),
    await avatarSpan(),
    h('hr'),
    h('p', ['New name']),
    await nameDiv(),
    h('hr'),
    //h('p', ['Did:web']),
    //await didweb(),
    //h('hr'),
    h('p', ['Sync']),
    queuePanel,
    pushEverything,
    pullEverything,
    h('hr'),
    h('p', ['Moderation']),
    await moderationPanel(),
    h('hr'),
    h('p', ['Import Keypair']),
    await editKey(),
    deleteEverything
  ])

  return div
}
