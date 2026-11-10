import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, errorText, type CreatedClass } from '../lib/api'
import { Alert } from '../components/Alert'

/** School admin: create a class (each shift is its own class with its own seats). */
export function AdminPage() {
  const [name, setName] = useState('')
  const [seats, setSeats] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedClass[]>([])

  const validate = (): string => {
    if (!name.trim()) return 'ক্লাসের নাম লিখুন (যেমন: Class 6 - Morning Shift)।'
    if (name.trim().length > 200) return 'ক্লাসের নাম ২০০ অক্ষরের মধ্যে হতে হবে।'
    if (!/^[0-9]+$/.test(seats.trim())) return 'আসনসংখ্যা একটি পূর্ণ সংখ্যা হতে হবে।'
    const n = Number(seats)
    if (n < 1 || n > 100000) return 'আসনসংখ্যা ১ থেকে ১০০০০০-এর মধ্যে হতে হবে।'
    return ''
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = validate()
    setError(v)
    if (v) return
    setBusy(true)
    try {
      const c = await api.createClass(name.trim(), Number(seats))
      setCreated((prev) => [c, ...prev])
      setName('')
      setSeats('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>নতুন ক্লাস তৈরি (School Admin)</h2>
      <p className="muted">প্রতিটি শিফট আলাদা ক্লাস হিসেবে তৈরি করুন, যেমন "Class 6 - Morning Shift" এবং "Class 6 - Day Shift"।</p>

      <form className="card form" onSubmit={submit} noValidate>
        <label>
          ক্লাসের নাম
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Class 6 - Morning Shift" maxLength={200} />
        </label>
        <label>
          মোট আসনসংখ্যা
          <input value={seats} onChange={(e) => setSeats(e.target.value)} inputMode="numeric" placeholder="120" />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'তৈরি হচ্ছে…' : 'ক্লাস তৈরি করুন'}
        </button>
        <Alert kind="error">{error}</Alert>
      </form>

      {created.length > 0 && (
        <Alert kind="success">
          তৈরি হয়েছে:
          <ul>
            {created.map((c) => (
              <li key={c.id}>
                {c.name} — {c.totalSeats}টি আসন (ID: {c.id})
              </li>
            ))}
          </ul>
          <Link to="/">ক্লাস তালিকায় দেখুন →</Link>
        </Alert>
      )}
    </section>
  )
}
