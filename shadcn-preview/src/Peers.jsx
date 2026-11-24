import { useEffect, useState } from 'react'
import { getRelayStatus } from '../../websocket.js'
import { getPeers, hasRoom, setPeerEnabled } from '../../gossip.js'
import { getQueueStatusSnapshot } from '../../network_queue.js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { defaultRelay, setRelayEnabled, setRoomEnabled } from './peer-connections'
import { usePreference } from './hooks/use-preview-state'

function relayAddress(value) {
  const address = value.trim()
  if (!URL.canParse(address)) throw new Error('Enter a valid WebSocket URL.')
  const url = new URL(address)
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Enter a WebSocket URL without credentials or a fragment.')
  }
  return url.href
}

function connectionSnapshot() {
  return { room: hasRoom(), peers: getPeers(), queue: getQueueStatusSnapshot() }
}

export default function Peers() {
  const [savedRelays, setSavedRelays] = usePreference('peer-relays', JSON.stringify([defaultRelay]))
  const relays = JSON.parse(savedRelays)
  const [address, setAddress] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState(connectionSnapshot)

  function refresh() {
    setSnapshot(connectionSnapshot())
  }

  useEffect(() => {
    const timer = setInterval(() => setSnapshot(connectionSnapshot()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function change(action) {
    setPending(true)
    setError('')
    try {
      await action()
    } catch (issue) {
      setError(issue.message || 'Could not change the connection.')
    } finally {
      refresh()
      setPending(false)
    }
  }

  function addRelay(event) {
    event.preventDefault()
    void change(() => {
      const url = relayAddress(address)
      if (relays.includes(url)) throw new Error('This relay is already listed.')
      setSavedRelays(JSON.stringify([...relays, url]))
      setAddress('')
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Peers</h1>
        <p className="text-sm text-muted-foreground">
          {snapshot.queue.total} queued · {snapshot.queue.high} high · {snapshot.queue.normal} normal · {snapshot.queue.low} low
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>WebSocket relays</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y divide-border">
            {relays.map(url => {
              const state = getRelayStatus(url)
              return (
                <li key={url} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0 break-all">
                    <div>{url}</div>
                    <div className="text-sm text-muted-foreground">
                      {state.connected ? 'Connected' : state.enabled ? 'Connecting or reconnecting' : 'Disconnected'}
                      {!state.connected && state.polling === 'Active' && ' · HTTP polling active'}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={pending}
                    onClick={() => change(() => setRelayEnabled(url, !state.enabled))}>
                    {state.enabled ? 'Disconnect' : 'Connect'}
                  </Button>
                </li>
              )
            })}
          </ul>
          <form onSubmit={addRelay} className="space-y-2">
            <Label htmlFor="peer-relay-url">WebSocket URL</Label>
            <div className="flex gap-2">
              <Input id="peer-relay-url" type="url" required value={address}
                onChange={event => setAddress(event.target.value)} placeholder="wss://relay.example.com/" />
              <Button type="submit" variant="outline" disabled={pending}>Add relay</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Trystero peers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {snapshot.room ? `${snapshot.peers.length} connected` : 'Room disconnected'}
            </p>
            <Button size="sm" variant="outline" disabled={pending}
              onClick={() => change(() => setRoomEnabled(!snapshot.room))}>
              {snapshot.room ? 'Leave room' : 'Join room'}
            </Button>
          </div>
          {snapshot.peers.length > 0 && (
            <ul className="divide-y divide-border">
              {snapshot.peers.map(peer => (
                <li key={peer.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0 break-all">
                    <div>{peer.id}</div>
                    <div className="text-sm text-muted-foreground">{peer.enabled ? 'Sync enabled' : 'Sync paused'}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    setPeerEnabled(peer.id, !peer.enabled)
                    refresh()
                  }}>{peer.enabled ? 'Pause' : 'Resume'}</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  )
}
