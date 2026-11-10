import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errorText, type Hold } from '../lib/api'
import { effectiveStatus } from '../lib/holds'
import { useNow, usePolling } from '../lib/hooks'
import { useStudent } from '../lib/student'
import { Alert, StaleNotice } from '../components/Alert'

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

  const apply = async (classId: string, className: string) => {
    setError('')
    if (!studentId) {
      setError('আবেদন করার আগে উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্মনিবন্ধন নম্বর দিন।')
      return
    }
    setApplying(classId)
    try {
      const hold = await api.createHold(classId, studentId)
      navigate(`/holds/${encodeURIComponent(hold.holdId)}`)
    } catch (e) {
      setError(`${className}: ${errorText(e)}`)
      void classes.refresh()
      void mine.refresh()
    } finally {
      setApplying(null)
    }
  }

  return (
    <section>
      <h2>ক্লাস তালিকা</h2>
      <p className="muted">
        আসনের হিসাব প্রতি {CLASS_REFRESH_MS / 1000} সেকেন্ডে স্বয়ংক্রিয়ভাবে হালনাগাদ হয়। "আগে আবেদন করলে আগে পাবে" ভিত্তিতে আসন
        দেওয়া হয়।
      </p>

      <Alert kind="error">{error}</Alert>
      {classes.data ? (
        <StaleNotice error={classes.error} lastUpdated={classes.lastUpdated} />
      ) : (
        <Alert kind="error">{classes.error?.message}</Alert>
      )}

      {classes.loading && !classes.data && <p>লোড হচ্ছে…</p>}

      {classes.data && classes.data.length === 0 && (
        <Alert kind="info">
          এখনও কোনো ক্লাস তৈরি হয়নি। <Link to="/admin">অ্যাডমিন পাতা</Link> থেকে ক্লাস তৈরি করুন।
        </Alert>
      )}

      {classes.data && classes.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ক্লাস</th>
                <th>মোট আসন</th>
                <th>Hold-এ আছে</th>
                <th>নিশ্চিত ভর্তি</th>
                <th>খালি আসন</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {classes.data.map((c) => {
                const active = activeByClass.get(c.id)
                return (
                  <tr key={c.id} data-testid={`class-row-${c.id}`}>
                    <td>{c.name}</td>
                    <td>{c.totalSeats}</td>
                    <td>{c.heldSeats}</td>
                    <td>{c.confirmedSeats}</td>
                    <td className={c.availableSeats === 0 ? 'full' : 'available'}>
                      {c.availableSeats === 0 ? '০ (পূর্ণ)' : c.availableSeats}
                    </td>
                    <td>
                      {active ? (
                        <Link to={`/holds/${encodeURIComponent(active.holdId)}`} className="button-link">
                          {active.status === 'CONFIRMED' ? 'ভর্তি নিশ্চিত — দেখুন' : 'আপনার আবেদন দেখুন'}
                        </Link>
                      ) : (
                        <button
                          className="primary"
                          disabled={applying !== null || c.availableSeats === 0}
                          title={c.availableSeats === 0 ? 'কোনো আসন খালি নেই' : undefined}
                          onClick={() => apply(c.id, c.name)}
                        >
                          {applying === c.id ? 'আবেদন হচ্ছে…' : 'আবেদন করুন'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
