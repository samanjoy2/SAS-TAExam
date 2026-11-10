import type { HoldStatus } from './api'

/** A HELD application whose deadline has passed is EXPIRED, even before the server says so. */
export function effectiveStatus(status: HoldStatus, expiresAt: string, now: number): HoldStatus {
  if (status === 'HELD' && new Date(expiresAt).getTime() <= now) return 'EXPIRED'
  return status
}

export function secondsLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export const STATUS_LABEL: Record<HoldStatus, string> = {
  HELD: 'আসন সংরক্ষিত (HELD) — ফি বাকি',
  CONFIRMED: 'ভর্তি নিশ্চিত (CONFIRMED)',
  EXPIRED: 'মেয়াদ শেষ (EXPIRED)',
  CANCELLED: 'বাতিল (CANCELLED)',
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'medium' })
}
