import { createProfileHeaderRenderer } from './client/ui/profile-header.js'
import { serializeWebsiteWrite } from './client/runtime/signing-queue.js'
import { apds } from 'apds'
import { h } from 'h'
import { appendMarkdown } from './markdown.js'
import { send } from './send.js'
import { resolveImageSrc } from './profile_image.js'
import { uploadProfilePhoto } from './upload.js'
import { downloadIdentityBackup } from './identity_backup.js'

export const { buildProfileHeader } = createProfileHeaderRenderer({
  protocol: apds, createElement: h, appendMarkdown, send, resolveImageSrc,
  uploadProfilePhoto, downloadIdentityBackup, serializeWebsiteWrite,
})
