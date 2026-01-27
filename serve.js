import { serveDir } from 'https://deno.land/std@0.224.0/http/file_server.ts'
import { contentType } from 'https://deno.land/std@0.224.0/media_types/mod.ts'
import { createNotificationsService } from './notifications_server.js'

const notifications = await createNotificationsService()

Deno.serve(async (r) => {
  const handled = await notifications.handleRequest(r)
  if (handled) return handled
  const url = new URL(r.url)
  if (url.pathname.startsWith('/apds')) {
    const relPath = url.pathname.replace(/^\/apds/, '') || '/'
    const filePath = '/home/ev/apds' + relPath
    try {
      const data = await Deno.readFile(filePath)
      let type = contentType(filePath)
      if (!type) {
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
          type = 'text/javascript'
        } else if (filePath.endsWith('.json')) {
          type = 'application/json'
        }
      }
      if (!type) { type = 'application/octet-stream' }
      return new Response(data, {
        status: 200,
        headers: { 'content-type': type }
      })
    } catch (err) {
      if (err && err.name === 'NotFound') {
        return new Response('Not found', { status: 404 })
      }
      return new Response('Error', { status: 500 })
    }
  }
  return serveDir(r, { quiet: 'True' })
})
