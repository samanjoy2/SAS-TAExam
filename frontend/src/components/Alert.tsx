import type { ReactNode } from 'react'

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  if (!children) return null
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' || kind === 'warning' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

/** Shown when a background refresh fails but older data is still on screen. */
export function StaleNotice({ error, lastUpdated }: { error?: { message: string }; lastUpdated?: number }) {
  if (!error) return null
  return (
    <Alert kind="warning">
      {error.message}
      {lastUpdated ? ` (শেষ সফল আপডেট: ${new Date(lastUpdated).toLocaleTimeString('bn-BD')}; স্বয়ংক্রিয়ভাবে আবার চেষ্টা করা হচ্ছে…)` : ' স্বয়ংক্রিয়ভাবে আবার চেষ্টা করা হচ্ছে…'}
    </Alert>
  )
}
