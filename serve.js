import { createWiredoveHandler } from './server/handler.js'

Deno.serve({
  port: Number(Deno.env.get('PORT') || 8000),
  hostname: Deno.env.get('HOST') || '0.0.0.0',
}, await createWiredoveHandler())
