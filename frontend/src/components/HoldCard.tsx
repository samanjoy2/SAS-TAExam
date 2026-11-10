import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BorderBeam } from 'border-beam'
import { api, errorText, type Hold, type HoldStatus } from '../lib/api'
import { effectiveStatus, formatDateTime, formatDuration, secondsLeft, STATUS_LABEL } from '../lib/holds'
import { useNow } from '../lib/hooks'
import { useStudent } from '../lib/student'
import { Alert } from './Alert'
import { Badge, type BadgeTone } from './arc/badge/badge'
import { Button } from './arc/button/button'
import { Countdown } from './arc/countdown/countdown'
import { ConfirmMorph } from './arc/confirm-morph/confirm-morph'
import { useToastStack } from './arc/toast-stack/toast-stack'

interface Props {
  hold: Hold
  /** Called after pay/cancel or when the countdown reaches zero, so the parent can refetch. */
  onChanged?: () => void
  showLink?: boolean
}

const TONE: Record<HoldStatus, BadgeTone> = { HELD: 'warning', CONFIRMED: 'success', EXPIRED: 'neutral', CANCELLED: 'danger' }

/**
 * One application: status, live countdown, "ভর্তি ফি দিন" and "বাতিল".
 * Expiry is evaluated against the local clock every half second, so the status flips to EXPIRED and
 * the pay button disables at the deadline without any reload or server round trip.
 */
export function HoldCard({ hold, onChanged, showLink }: Props) {
  const { studentId } = useStudent()
  const { toast } = useToastStack()
  const now = useNow(500)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const status = effectiveStatus(hold.status, hold.expiresAt, now)
  const left = secondsLeft(hold.expiresAt, now)
  const isOwner = !hold.studentId || hold.studentId === studentId
  const canAct = status === 'HELD' && !!studentId && isOwner && !busy

  // Let the parent pull fresh data (seat counts, server status) the moment the hold lapses.
  const notifiedExpiry = useRef(false)
  useEffect(() => {
    if (status === 'EXPIRED' && hold.status === 'HELD' && !notifiedExpiry.current) {
      notifiedExpiry.current = true
      onChanged?.()
    }
  }, [status, hold.status, onChanged])

  const pay = async () => {
    setBusy(true)
    setError('')
    try {
      await api.confirmHold(hold.holdId, studentId)
      toast({ type: 'success', title: 'ভর্তি নিশ্চিত হয়েছে!', description: `${hold.className ?? 'ক্লাস'} — ভর্তি ফি জমা হয়েছে।` })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
      onChanged?.()
    }
  }

  const cancel = async () => {
    setError('')
    try {
      await api.cancelHold(hold.holdId, studentId)
      toast({ type: 'info', title: 'আবেদন বাতিল হয়েছে', description: 'আসনটি অন্যদের জন্য ছেড়ে দেওয়া হয়েছে।' })
    } catch (e) {
      setError(errorText(e))
      throw e // lets ConfirmMorph show its error face
    } finally {
      onChanged?.()
    }
  }

  const card = (
    <article className={`hold-card status-${status.toLowerCase()}`} data-testid="hold-card">
      <header className="hold-head">
        <div>
          <p className="eyebrow">আবেদন</p>
          <h3>{hold.className ?? hold.classId}</h3>
        </div>
        <Badge tone={TONE[status]} dot pill data-testid="hold-status">
          {STATUS_LABEL[status]}
        </Badge>
      </header>

      {status === 'HELD' && (
        <div className="hold-timer" data-testid="countdown" data-seconds-left={left} title={formatDuration(left)}>
          <Countdown
            target={hold.expiresAt}
            units={['minutes', 'seconds']}
            label="ফি জমার মেয়াদ শেষ হতে বাকি"
            completeLabel="মেয়াদ শেষ"
          />
          <p className="muted">এই সময়ের মধ্যে ভর্তি ফি জমা দিন, নইলে আসনটি ছেড়ে দেওয়া হবে।</p>
        </div>
      )}

      <dl className="hold-meta">
        <dt>আবেদন নম্বর</dt>
        <dd>{showLink ? <Link to={`/holds/${encodeURIComponent(hold.holdId)}`}>{hold.holdId}</Link> : hold.holdId}</dd>
        <dt>{status === 'HELD' ? 'ফি জমার শেষ সময়' : 'মেয়াদ ছিল'}</dt>
        <dd>{formatDateTime(hold.expiresAt)}</dd>
      </dl>

      {status === 'EXPIRED' && (
        <Alert kind="warning" title="আবেদনের মেয়াদ শেষ">
          নির্ধারিত সময়ের মধ্যে ফি জমা না হওয়ায় আসনটি ছেড়ে দেওয়া হয়েছে। চাইলে ক্লাস তালিকা থেকে আবার আবেদন করুন।
        </Alert>
      )}
      {status === 'CONFIRMED' && <Alert kind="success" title="ভর্তি নিশ্চিত">ভর্তি ফি জমা হয়েছে। অভিনন্দন!</Alert>}
      {!isOwner && (
        <Alert kind="info">এই আবেদনটি অন্য শিক্ষার্থীর ({hold.studentId})। ফি দিতে বা বাতিল করতে উপরে সেই নম্বরটি দিন।</Alert>
      )}
      {status === 'HELD' && !studentId && <Alert kind="info">ফি দিতে বা বাতিল করতে উপরে জন্মনিবন্ধন নম্বর দিন।</Alert>}

      <div className="actions">
        <Button variant="primary" onClick={pay} disabled={!canAct} loading={busy}>
          ভর্তি ফি দিন
        </Button>
        <ConfirmMorph
          label="বাতিল"
          prompt="আবেদনটি বাতিল করবেন?"
          confirmLabel="হ্যাঁ, বাতিল"
          cancelLabel="না"
          pendingLabel="বাতিল হচ্ছে"
          doneLabel="বাতিল হয়েছে"
          errorLabel="বাতিল করা যায়নি"
          retryLabel="আবার চেষ্টা"
          disabled={!canAct}
          onConfirm={cancel}
        />
      </div>

      <Alert kind="error">{error}</Alert>
    </article>
  )

  // A soft travelling beam marks applications that still need action.
  return status === 'HELD' && isOwner ? (
    <BorderBeam size="md" colorVariant="ocean" theme="light" strength={0.6}>
      {card}
    </BorderBeam>
  ) : (
    card
  )
}
