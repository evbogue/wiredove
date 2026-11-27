import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

async function registerSubscription(subscription, enabled) {
  const response = await fetch('/api/notifications/' + (enabled ? 'subscribe' : 'unsubscribe'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(enabled ? subscription : { endpoint: subscription.endpoint }),
  })
  if (!response.ok) throw Error('Could not update notifications. Try again.')
}

export function PostNotifications() {
  const supported = window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  const blocked = supported && Notification.permission === 'denied'
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const worker = new URL(import.meta.env.BASE_URL + 'post-notifications.js', location.origin)
  useEffect(() => {
    let active = true
    async function refresh() {
      if (!supported || blocked) return
      const registration = await navigator.serviceWorker.getRegistration(worker.href)
      if (registration?.active?.scriptURL !== worker.href) return
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        await registerSubscription(sub, true)
        if (active) setEnabled(true)
      }
    }
    refresh().catch(error => { if (active) setMessage(error.message) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [supported, blocked, worker.href])

  async function toggle(next) {
    setBusy(true)
    setMessage('')
    try {
      if (next && await Notification.requestPermission() !== 'granted') {
        setMessage('Permission was not granted.')
        return
      }
      await navigator.serviceWorker.register(worker.href)
      const registration = await navigator.serviceWorker.ready
      let sub = await registration.pushManager.getSubscription()
      if (next && !sub) {
        const response = await fetch('/vapid-public-key')
        if (!response.ok) throw Error('Push service unavailable. Try again.')
        const { key } = await response.json()
        const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
        sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
      }
      if (sub) {
        await registerSubscription(sub, next)
        if (!next) await sub.unsubscribe()
      }
      setEnabled(next)
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  const status = !supported ? 'Browser notifications are unavailable here.'
    : blocked ? 'Allow notifications in your browser’s site settings.' : message
  return <>
    <Field orientation="horizontal">
      <Switch id="post-notifications" checked={enabled} onCheckedChange={toggle} disabled={busy || !supported || blocked} />
      <FieldLabel htmlFor="post-notifications">Notify me about every new post on this device</FieldLabel>
    </Field>
    {status && <Alert role="status"><AlertDescription>{status}</AlertDescription></Alert>}
  </>
}
