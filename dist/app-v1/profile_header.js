import { createProfileHeaderRenderer } from './client/ui/profile-header.js'
import { serializeWebsiteWrite } from './client/runtime/signing-queue.js'
import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'
import { h } from 'https://esm.sh/gh/evbogue/apds@78abedd/lib/h.js'
import { appendMarkdown } from './markdown.js'
import { send } from './send.js'
import { resolveImageSrc } from './profile_image.js'
import { uploadProfilePhoto } from './upload.js'
import { downloadIdentityBackup } from './identity_backup.js'

export const { buildProfileHeader } = createProfileHeaderRenderer({
  protocol: apds, createElement: h, appendMarkdown, send, resolveImageSrc,
  uploadProfilePhoto, downloadIdentityBackup, serializeWebsiteWrite,
})
