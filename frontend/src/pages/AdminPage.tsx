import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, errorText } from '../lib/api'
import { usePolling } from '../lib/hooks'
import { Alert, StaleNotice } from '../components/Alert'
import { SeatBar } from '../components/SeatBar'
import { Button } from '../components/arc/button/button'
import { EmptyState } from '../components/arc/empty-state/empty-state'
import { Input } from '../components/arc/input/input'
import { useToastStack } from '../components/arc/toast-stack/toast-stack'

const EXAMPLES = ['Class 6 - Morning Shift', 'Class 6 - Day Shift', 'Class 7 - Morning Shift']

/** School admin: create a class (each shift is its own class with its own seats), next to the live class list. */
export function AdminPage() {
  const { toast } = useToastStack()
  const classes = usePolling(() => api.listClasses(), 3000, [])
  const [name, setName] = useState('')
  const [seats, setSeats] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; seats?: string }>({})

  const validate = () => {
    const errs: { name?: string; seats?: string } = {}
    if (!name.trim()) errs.name = 'ক্লাসের নাম লিখুন (যেমন: Class 6 - Morning Shift)।'
    else if (name.trim().length > 200) errs.name = 'ক্লাসের নাম ২০০ অক্ষরের মধ্যে হতে হবে।'
    if (!/^[0-9]+$/.test(seats.trim())) errs.seats = 'আসনসংখ্যা একটি পূর্ণ সংখ্যা হতে হবে।'
    else if (Number(seats) < 1 || Number(seats) > 100000) errs.seats = 'আসনসংখ্যা ১ থেকে ১০০০০০-এর মধ্যে হতে হবে।'
    return errs
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setFieldErrors(errs)
    setError('')
    if (errs.name || errs.seats) return
    setBusy(true)
    try {
      const c = await api.createClass(name.trim(), Number(seats))
      toast({ type: 'success', title: 'ক্লাস তৈরি হয়েছে', description: `${c.name} — ${c.totalSeats}টি আসন` })
      setName('')
      setSeats('')
      void classes.refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>ক্লাস তৈরি</h2>
          <p className="muted">School Admin — প্রতিটি শিফট আলাদা ক্লাস হিসেবে তৈরি করুন, নিজস্ব আসনসংখ্যাসহ।</p>
        </div>
      </div>

      <div className="admin-layout">
        <form className="panel form" onSubmit={submit} noValidate>
          <h3>নতুন ক্লাস</h3>
          <Input
            label="ক্লাসের নাম"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Class 6 - Morning Shift"
            maxLength={200}
            error={fieldErrors.name}
          />
          <div className="chips" aria-label="উদাহরণ নাম">
            {EXAMPLES.map((ex) => (
              <button type="button" key={ex} className="chip" onClick={() => setName(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <Input
            label="মোট আসনসংখ্যা"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            inputMode="numeric"
            placeholder="120"
            error={fieldErrors.seats}
          />
          <div>
            <Button variant="primary" type="submit" loading={busy}>
              ক্লাস তৈরি করুন
            </Button>
          </div>
          <Alert kind="error" title="ক্লাস তৈরি করা যায়নি">
            {error}
          </Alert>
        </form>

        <div className="panel">
          <div className="panel-head">
            <h3>বর্তমান ক্লাসসমূহ</h3>
            <Link to="/" className="subtle-link">
              ক্লাস তালিকা →
            </Link>
          </div>
          {classes.data ? (
            <StaleNotice error={classes.error} lastUpdated={classes.lastUpdated} />
          ) : (
            <Alert kind="error">{classes.error?.message}</Alert>
          )}
          {classes.data && classes.data.length === 0 && (
            <EmptyState title="কোনো ক্লাস নেই" description="বাম দিকের ফর্ম থেকে প্রথম ক্লাসটি তৈরি করুন।" />
          )}
          <ul className="admin-list">
            {classes.data?.map((c) => (
              <li key={c.id}>
                <div className="admin-list-row">
                  <strong>{c.name}</strong>
                  <span className="muted">
                    {c.availableSeats}/{c.totalSeats} খালি
                  </span>
                </div>
                <SeatBar total={c.totalSeats} confirmed={c.confirmedSeats} held={c.heldSeats} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
