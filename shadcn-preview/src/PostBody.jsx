import { useLayoutEffect, useRef } from 'react'
import { disposeMedia, renderAndFSMedia } from '../../client/ui/media-render.js'
import { andfsImageMetadata, attachmentDisplayBody, isAndFSAudio } from '../../client/andfs.js'
import { isMessageHash } from '../../client/protocol.js'
import { appendFormattedText } from '../../client/ui/body.js'

function resolvePostLink(href) {
  if (href.startsWith('/#') && isMessageHash(href.slice(2))) return href.slice(1)
  return undefined
}

export function PostBody({ body, attachment }) {
  const container = useRef(null)
  useLayoutEffect(() => {
    const target = container.current
    const fragment = target.ownerDocument.createDocumentFragment()
    const audio = isAndFSAudio(attachment) ? attachment : null
    appendFormattedText(fragment, audio ? attachmentDisplayBody({ ...audio, body }) : body, {
      resolveLink: resolvePostLink,
      hashtags: false,
      acceptMarkdownImage: src => Boolean(andfsImageMetadata(src)),
      showUnavailableAlt: true,
    })
    target.replaceChildren(fragment)
    if (audio) renderAndFSMedia(audio, target)
    return () => disposeMedia(target)
  }, [body, attachment])

  return <div ref={container} className="preview-post-body overflow-x-auto [overflow-wrap:anywhere]" />
}
