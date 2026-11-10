import type { ReactNode } from 'react'
import { Alert as ArcAlert, type AlertTone } from './arc/alert/alert'

type Kind = 'error' | 'success' | 'info' | 'warning'

const TONE: Record<Kind, AlertTone> = { error: 'danger', warning: 'warning', success: 'success', info: 'info' }
const TITLE: Record<Kind, string> = { error: 'সমস্যা হয়েছে', warning: 'সতর্কতা', success: 'সফল', info: 'তথ্য' }

/** Thin wrapper over Arc UI's Alert with Bengali default titles. Renders nothing without content. */
export function Alert({ kind = 'error', title, children }: { kind?: Kind; title?: string; children?: ReactNode }) {
  if (!children) return null
  return (
    <ArcAlert tone={TONE[kind]} title={title ?? TITLE[kind]} className="my-3">
      {children}
    </ArcAlert>
  )
}

/** Shown when a background refresh fails but older data is still on screen. */
export function StaleNotice({ error, lastUpdated }: { error?: { message: string }; lastUpdated?: number }) {
  if (!error) return null
  return (
    <Alert kind="warning" title="হালনাগাদ করা যাচ্ছে না">
      {error.message}
      {lastUpdated
        ? ` শেষ সফল আপডেট: ${new Date(lastUpdated).toLocaleTimeString('bn-BD')}। স্বয়ংক্রিয়ভাবে আবার চেষ্টা করা হচ্ছে…`
        : ' স্বয়ংক্রিয়ভাবে আবার চেষ্টা করা হচ্ছে…'}
    </Alert>
  )
}
