import { createSettingsWidget } from './client/ui/settings.js'
import { serializeWebsiteWrite } from './client/runtime/signing-queue.js'
import { h } from 'h'
import { apds } from 'apds'
import { downloadIdentityBackup, validateIdentityBackup } from './identity_backup.js'
import { clearQueue, getQueueSize, queueSend } from './network_queue.js'
import { addBlockedAuthor, getModerationState, removeBlockedAuthor, saveModerationState, splitTextList } from './moderation.js'

export const createSettings = application => createSettingsWidget(application, {
  serializeWebsiteWrite, h, apds, downloadIdentityBackup, validateIdentityBackup,
  clearQueue, getQueueSize, queueSend, addBlockedAuthor, getModerationState,
  removeBlockedAuthor, saveModerationState, splitTextList,
})
