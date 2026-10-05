import { useEffect, useState } from 'react'
import { useAIActivityStore } from '../store/ai-activity-store'

/** Slim banner shown when the browser is offline or the last AI call never reached the service. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const networkError = useAIActivityStore((s) => s.networkError)

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      useAIActivityStore.getState().setNetworkError(false)
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online && !networkError) return null

  return (
    <output
      aria-live="polite"
      data-testid="offline-banner"
      style={{
        display: 'block',
        padding: '6px 16px',
        fontSize: '12px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        color: 'var(--structure-gap, #ef5350)',
      }}
    >
      {online
        ? 'Could not reach the AI service. Your script is safe: it is saved on this device. Retry when your connection is back.'
        : 'You are offline. Your script is safe: it is saved on this device. AI features will work again when you reconnect.'}
    </output>
  )
}
