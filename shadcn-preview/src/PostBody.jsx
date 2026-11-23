import { useLayoutEffect, useRef } from 'react'
import { isMessageHash } from '../../client/protocol.js'
import { appendFormattedText } from '../../client/ui/body.js'

function resolvePostLink(href) {
  if (href.startsWith('/#') && isMessageHash(href.slice(2))) return href.slice(1)
  return undefined
}

export function PostBody({ body }) {
  const container = useRef(null)
  useLayoutEffect(() => {
    const target = container.current
    const fragment = target.ownerDocument.createDocumentFragment()
    appendFormattedText(fragment, body, {
      resolveLink: resolvePostLink,
      hashtags: false,
      resolveMarkdownImage: () => '',
    })
    target.replaceChildren(fragment)
  }, [body])

  return <div ref={container} className="preview-post-body overflow-x-auto [overflow-wrap:anywhere]" />
}
