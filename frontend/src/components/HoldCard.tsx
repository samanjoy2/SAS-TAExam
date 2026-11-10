import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorText, type Hold } from '../lib/api'
import { effectiveStatus, formatDateTime, formatDuration, secondsLeft, STATUS_LABEL } from '../lib/holds'
import { useNow } from '../lib/hooks'
import { useStudent } from '../lib/student'
import { Alert } from './Alert'

interface Props {
  hold: Hold
  /** Called after pay/cancel or when the countdown reaches zero, so the parent can refetch. */
  onChanged?: () => void
  showLink?: boolean
}

/**
 * One application: status, live countdown, "ভর্তি ফি দিন" and "বাতিল" buttons.
 * Expiry is evaluated against the local clock every second, so the status flips to EXPIRED and
 * the pay button disables at the deadline without any reload or server round trip.
 */
export function HoldCard({ hold, onChanged, showLink }: Props) {
  const { studentId } = useStudent()
  const now = useNow(500)
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const status = effectiveStatus(hold.status, hold.expiresAt, now)
  const left = secondsLeft(hold.expiresAt, now)
  const isOwner = !hold.studentId || hold.studentId === studentId
  const canAct = status === 'HELD' && !!studentId && isOwner && busy === null

  // Let the parent pull fresh data (seat counts, server status) the moment the hold lapses.
  const notifiedExpiry = useRef(false)
  useEffect(() => {
    if (status === 'EXPIRED' && hold.status === 'HELD' && !notifiedExpiry.current) {
      notifiedExpiry.current = true
      onChanged?.()
    }
  }, [status, hold.status, onChanged])

  const pay = async () => {
    setBusy('pay')
    setError('')
    setSuccess('')
    try {
      await api.confirmHold(hold.holdId, studentId)
      setSuccess('ভর্তি ফি জমা হয়েছে। ভর্তি নিশ্চিত হয়েছে! 🎉')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
      onChanged?.()
    }
  }

  const cancel = async () => {
    if (!window.confirm('আপনি কি নিশ্চিতভাবে এই আবেদনটি বাতিল করতে চান? আসনটি অন্যদের জন্য ছেড়ে দেওয়া হবে।')) return
    setBusy('cancel')
    setError('')
    setSuccess('')
    try {
      await api.cancelHold(hold.holdId, studentId)
      setSuccess('আবেদন বাতিল করা হয়েছে।')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
      onChanged?.()
    }
  }

  return (
    <div className={`hold-card status-${status.toLowerCase()}`} data-testid="hold-card">
      <div className="hold-head">
        <strong>{hold.className ?? hold.classId}</strong>
        <span className={`badge badge-${status.toLowerCase()}`} data-testid="hold-status">
          {STATUS_LABEL[status]}
        </span>
      </div>

      <dl className="hold-meta">
        <dt>আবেদন নম্বর</dt>
        <dd>
          {showLink ? <Link to={`/holds/${encodeURIComponent(hold.holdId)}`}>{hold.holdId}</Link> : hold.holdId}
        </dd>
        {status === 'HELD' && (
          <>
            <dt>মেয়াদ শেষ হতে বাকি</dt>
            <dd className={left <= 60 ? 'countdown urgent' : 'countdown'} data-testid="countdown">
              {formatDuration(left)}
            </dd>
          </>
        )}
        <dt>{status === 'HELD' ? 'ফি জমার শেষ সময়' : 'মেয়াদ ছিল'}</dt>
        <dd>{formatDateTime(hold.expiresAt)}</dd>
      </dl>

      {status === 'EXPIRED' && (
        <Alert kind="warning">নির্ধারিত সময়ের মধ্যে ফি জমা না হওয়ায় আবেদনের মেয়াদ শেষ হয়েছে। আসনটি ছেড়ে দেওয়া হয়েছে।</Alert>
      )}
      {!isOwner && <Alert kind="info">এই আবেদনটি অন্য শিক্ষার্থীর ({hold.studentId})। ফি দিতে বা বাতিল করতে উপরে সেই নম্বরটি দিন।</Alert>}
      {status === 'HELD' && !studentId && <Alert kind="info">ফি দিতে বা বাতিল করতে উপরে জন্মনিবন্ধন নম্বর দিন।</Alert>}

      <div className="actions">
        <button className="primary" onClick={pay} disabled={!canAct}>
          {busy === 'pay' ? 'প্রক্রিয়াধীন…' : 'ভর্তি ফি দিন'}
        </button>
        <button className="danger" onClick={cancel} disabled={!canAct}>
          {busy === 'cancel' ? 'প্রক্রিয়াধীন…' : 'বাতিল'}
        </button>
      </div>

      <Alert kind="success">{success}</Alert>
      <Alert kind="error">{error}</Alert>
    </div>
  )
}
