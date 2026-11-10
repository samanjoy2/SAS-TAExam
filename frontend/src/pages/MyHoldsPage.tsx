import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { usePolling } from '../lib/hooks'
import { useStudent } from '../lib/student'
import { HoldCard } from '../components/HoldCard'
import { Alert, StaleNotice } from '../components/Alert'

/** Every application of the current student with its live status. */
export function MyHoldsPage() {
  const { studentId } = useStudent()
  const holds = usePolling(() => api.myHolds(studentId), 4000, [studentId], !!studentId)

  return (
    <section>
      <h2>আমার আবেদন</h2>
      {!studentId && <Alert kind="info">আবেদনগুলো দেখতে উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্মনিবন্ধন নম্বর দিন।</Alert>}
      {studentId && holds.loading && !holds.data && <p>লোড হচ্ছে…</p>}
      {holds.data ? (
        <StaleNotice error={holds.error} lastUpdated={holds.lastUpdated} />
      ) : (
        <Alert kind="error">{holds.error?.message}</Alert>
      )}
      {holds.data && holds.data.length === 0 && (
        <Alert kind="info">
          এই শিক্ষার্থীর কোনো আবেদন নেই। <Link to="/">ক্লাস তালিকা</Link> থেকে আবেদন করুন।
        </Alert>
      )}
      <div className="hold-list">
        {holds.data?.map((h) => (
          <HoldCard key={h.holdId} hold={{ ...h, studentId }} onChanged={() => void holds.refresh()} showLink />
        ))}
      </div>
    </section>
  )
}
