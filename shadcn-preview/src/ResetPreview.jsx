import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { resetPreview } from './reset-preview'

export function ResetPreview() {
  const [error, setError] = useState('')

  function run() {
    setError('')
    void resetPreview().catch(issue => setError(issue.message || 'Browser storage could not be cleared.'))
  }

  useEffect(() => {
    void resetPreview().catch(issue => setError(issue.message || 'Browser storage could not be cleared.'))
  }, [])

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Resetting local data</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <Button onClick={run}>Retry reset</Button>
        </>
      ) : <p role="status">Clearing the preview’s browser storage…</p>}
    </main>
  )
}
