import { serveDir } from 'https://deno.land/std@0.224.0/http/file_server.ts'
import { createNotificationsService } from './notifications_server.js'

const notifications = await createNotificationsService()

Deno.serve(async (r) => {
  const handled = await notifications.handleRequest(r)
  if (handled) return handled
  return serveDir(r, { quiet: 'True' })
})
