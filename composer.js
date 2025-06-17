import { bogbot } from 'bogbot'
import { render } from './render.js'
import { h } from 'h'
import { avatarSpan, nameSpan } from './profile.js' 
import { ntfy } from './ntfy.js' 
import { send } from './send.js'
import { markdown } from './markdown.js'

export const composer = async (sig) => {
  const obj = {}
  if (sig) {
    const hash = await bogbot.hash(sig)
    obj.replyHash = hash
    obj.replyAuthor = sig.substring(0, 44)
    const opened = await bogbot.open(sig)
    const msg = await bogbot.parseYaml(await bogbot.get(opened.substring(13)))
    if (msg.name) { obj.replyName = msg.name }
    if (msg.body) {obj.replyBody = msg.body}
  }

  const replyDiv = h('div')

  if (obj.replyHash) {
    const replySymbol = h('span', {classList: 'material-symbols-outlined'}, ['Subdirectory_Arrow_left'])
    const author = h('a', {href: '#' + obj.replyAuthor}, [obj.replyAuthor.substring(0, 10)])
    const replyContent = h('a', {href: '#' + obj.replyHash}, [obj.replyHash.substring(0, 10)])
    replyDiv.appendChild(author)
    if (obj.replyName) { author.textContent = obj.replyName}
    if (obj.replyBody) { replyContent.textContent = obj.replyBody.substring(0, 10) + '...'}
    replyDiv.appendChild(replySymbol)
    replyDiv.appendChild(replyContent)
  }

  const textarea = h('textarea', {placeholder: 'Write a message'})

  const cancel = h('a', {classList: 'material-symbols-outlined', onclick: () => {
      div.parentNode.removeChild(div)
    }
  }, ['Cancel'])

  const replyObj = {}

  if (sig) {
    replyObj.reply = await bogbot.hash(sig)
    replyObj.replyto = sig.substring(0, 44)
  }

  const pubkey = await bogbot.pubkey()

  const publishButton = h('button', {style: 'margin-left: auto; margin-right: 0px;', onclick: async () => {
    const published = await bogbot.compose(textarea.value, replyObj)
    textarea.value = ''
    const scroller = document.getElementById('scroller')
    const signed = await bogbot.get(published)
    const opened = await bogbot.open(signed)

    const blob = await bogbot.get(opened.substring(13))
    await ntfy(signed)
    await ntfy(blob)
    await send(signed)
    await send(blob)
    const hash = await bogbot.hash(signed)
    div.id = hash
    await render.blob(signed)
    composerDiv.remove()
  }}, ['Publish'])

  const previewButton = h('button', {style: 'margin-left: auto; margin-right: 0px;', onclick: async () => {
    textareaDiv.style = 'display: none;'
    previewDiv.style = 'display: block;'
    content.innerHTML = await markdown(textarea.value)
  }}, ['Preview'])

  const textareaDiv = h('div', [
    textarea,
    previewButton
  ])

  const content = h('div')

  const previewDiv = h('div', {style: 'display: none;'}, [
    content,
    h('button', {style: 'margin-left: auto; margin-right: 0px;', onclick: () => { 
     textareaDiv.style = 'display: block;'
     previewDiv.style = 'display: none;'
    }}, ['Cancel']),
    publishButton
  ])

  const composerDiv = h('div', [
    h('span', {style: 'float: right;'}, [h('code', {classList: 'pubkey'}, [pubkey.substring(0, 6)]), ' ', cancel]),
    h('span', {style: 'float: left;'}, [await avatarSpan()]),
    await nameSpan(),
    replyDiv,
    textareaDiv,
    previewDiv
  ])

  const div = h('div', {classList: 'message'}, [
    composerDiv
  ])

  if (sig) { div.classList = 'message reply'}

  return div
  
}
