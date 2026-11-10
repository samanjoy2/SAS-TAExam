import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errorText, type ClassSummary, type Hold } from '../lib/api'
import { effectiveStatus } from '../lib/holds'
import { useNow, usePolling } from '../lib/hooks'
import { useStudent } from '../lib/student'
import { Alert, StaleNotice } from '../components/Alert'
import { AnimatedCounter } from '../components/arc/animated-counter/animated-counter'
import { Badge } from '../components/arc/badge/badge'
import { Button } from '../components/arc/button/button'
import { EmptyState } from '../components/arc/empty-state/empty-state'
import { Skeleton } from '../components/arc/skeleton/skeleton'
import { UsageMeter } from '../components/arc/usage-meter/usage-meter'

export const CLASS_REFRESH_MS = 3000

/** Class list with live seat counts (auto-refreshed) and an "আবেদন করুন" button per class. */
export function ClassesPage() {
  const { studentId } = useStudent()
  const navigate = useNavigate()
  const now = useNow(1000)
  const classes = usePolling(() => api.listClasses(), CLASS_REFRESH_MS, [])
  const mine = usePolling(() => api.myHolds(studentId), 5000, [studentId], !!studentId)
  const [applying, setApplying] = useState<string | null>(null)
  const [error, setError] = useState('')

  // The student's live application per class (HELD and not lapsed, or CONFIRMED).
  const activeByClass = useMemo(() => {
    const map = new Map<string, Hold>()
    for (const h of mine.data ?? []) {
      const s = effectiveStatus(h.status, h.expiresAt, now)
      if (s === 'HELD' || s === 'CONFIRMED') map.set(h.classId, { ...h, status: s })
    }
    return map
  }, [mine.data, now])

  const apply = async (c: ClassSummary) => {
    setError('')
    if (!studentId) {
      setError('আবেদন করার আগে উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্মনিবন্ধন নম্বর দিন।')
      return
    }
    setApplying(c.id)
    try {
      const hold = await api.createHold(c.id, studentId)
      navigate(`/holds/${encodeURIComponent(hold.holdId)}`)
    } catch (e) {
      setError(`${c.name}: ${errorText(e)}`)
      void classes.refresh()
      void mine.refresh()
    } finally {
      setApplying(null)
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>ক্লাস তালিকা</h2>
          <p className="muted">
            "আগে আবেদন করলে আগে পাবে" — আসনের হিসাব প্রতি {CLASS_REFRESH_MS / 1000} সেকেন্ডে নিজে থেকেই হালনাগাদ হয়।
          </p>
        </div>
        <Badge tone="info" dot pill>
          লাইভ
        </Badge>
      </div>

      <Alert kind="error" title="আবেদন করা যায়নি">
        {error}
      </Alert>
      {classes.data ? (
        <StaleNotice error={classes.error} lastUpdated={classes.lastUpdated} />
      ) : (
        <Alert kind="error" title="ক্লাস তালিকা লোড করা যায়নি">
          {classes.error?.message}
        </Alert>
      )}

      {classes.loading && !classes.data && (
        <div className="class-grid">
          <Skeleton label="ক্লাস লোড হচ্ছে" lines={4} />
          <Skeleton label="ক্লাস লোড হচ্ছে" lines={4} />
        </div>
      )}

      {classes.data && classes.data.length === 0 && (
        <EmptyState
          title="এখনও কোনো ক্লাস নেই"
          description="স্কুল অ্যাডমিন ক্লাস তৈরি করলে এখানে দেখা যাবে।"
          action={
            <Link to="/admin" className="link-button">
              ক্লাস তৈরি করুন →
            </Link>
          }
        />
      )}

      {classes.data && classes.data.length > 0 && (
        <div className="class-grid">
          {classes.data.map((c) => {
            const active = activeByClass.get(c.id)
            const full = c.availableSeats === 0
            return (
              <article key={c.id} className="class-card" data-testid={`class-row-${c.id}`}>
                <header className="class-card-head">
                  <h3>{c.name}</h3>
                  {full ? (
                    <Badge tone="danger" pill>
                      পূর্ণ
                    </Badge>
                  ) : (
                    <Badge tone="success" pill>
                      আসন খালি আছে
                    </Badge>
                  )}
                </header>

                <div className="stats">
                  <div className="stat">
                    <span className="stat-label">মোট</span>
                    <AnimatedCounter value={c.totalSeats} />
                  </div>
                  <div className="stat">
                    <span className="stat-label">Hold</span>
                    <AnimatedCounter value={c.heldSeats} />
                  </div>
                  <div className="stat">
                    <span className="stat-label">নিশ্চিত</span>
                    <AnimatedCounter value={c.confirmedSeats} />
                  </div>
                  <div className={full ? 'stat stat-full' : 'stat stat-free'}>
                    <span className="stat-label">খালি</span>
                    <AnimatedCounter value={c.availableSeats} />
                  </div>
                </div>

                <UsageMeter
                  label="আসনের অবস্থা"
                  limit={c.totalSeats}
                  decimals={0}
                  unit=" আসন"
                  freeLabel="খালি"
                  overLabel="পূর্ণ"
                  segments={[
                    { id: 'confirmed', label: 'নিশ্চিত', value: c.confirmedSeats },
                    { id: 'held', label: 'Hold', value: c.heldSeats },
                  ]}
                />

                <div className="class-card-foot">
                  {active ? (
                    <Link to={`/holds/${encodeURIComponent(active.holdId)}`} className="link-button">
                      {active.status === 'CONFIRMED' ? 'ভর্তি নিশ্চিত — দেখুন' : 'আপনার আবেদন দেখুন →'}
                    </Link>
                  ) : (
                    <Button
                      variant="primary"
                      disabled={applying !== null || full}
                      loading={applying === c.id}
                      title={full ? 'কোনো আসন খালি নেই' : undefined}
                      onClick={() => apply(c)}
                    >
                      আবেদন করুন
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
