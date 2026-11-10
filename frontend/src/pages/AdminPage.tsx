import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, errorText } from '../lib/api'
import { Alert } from '../components/Alert'
import { Button } from '../components/arc/button/button'
import { Input } from '../components/arc/input/input'
import { useToastStack } from '../components/arc/toast-stack/toast-stack'

/** School admin: create a class (each shift is its own class with its own seats). */
export function AdminPage() {
  const { toast } = useToastStack()
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
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="narrow">
      <div className="page-head">
        <div>
          <h2>নতুন ক্লাস তৈরি</h2>
          <p className="muted">
            School Admin — প্রতিটি শিফট আলাদা ক্লাস হিসেবে তৈরি করুন, যেমন "Class 6 - Morning Shift" ও "Class 6 - Day Shift"।
          </p>
        </div>
      </div>

      <form className="panel form" onSubmit={submit} noValidate>
        <Input
          label="ক্লাসের নাম"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Class 6 - Morning Shift"
          maxLength={200}
          error={fieldErrors.name}
        />
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
      <p>
        <Link to="/">ক্লাস তালিকায় দেখুন →</Link>
      </p>
    </section>
  )
}
