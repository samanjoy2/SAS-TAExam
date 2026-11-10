import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { usePolling } from '../lib/hooks'
import { useStudent } from '../lib/student'
import { HoldCard } from '../components/HoldCard'
import { Alert, StaleNotice } from '../components/Alert'
import { EmptyState } from '../components/arc/empty-state/empty-state'
import { Skeleton } from '../components/arc/skeleton/skeleton'

/** Every application of the current student with its live status. */
export function MyHoldsPage() {
  const { studentId } = useStudent()
  const holds = usePolling(() => api.myHolds(studentId), 4000, [studentId], !!studentId)

  return (
    <section className="narrow">
      <div className="page-head">
        <div>
          <h2>আমার আবেদন</h2>
          {studentId && <p className="muted">শিক্ষার্থী: {studentId}</p>}
        </div>
      </div>

      {!studentId && (
        <EmptyState title="জন্মনিবন্ধন নম্বর দিন" description="আবেদনগুলো দেখতে উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্মনিবন্ধন নম্বর লিখুন।" />
      )}
      {studentId && holds.loading && !holds.data && <Skeleton label="আবেদন লোড হচ্ছে" lines={4} />}
      {holds.data ? (
        <StaleNotice error={holds.error} lastUpdated={holds.lastUpdated} />
      ) : (
        <Alert kind="error" title="আবেদন লোড করা যায়নি">
          {holds.error?.message}
        </Alert>
      )}
      {holds.data && holds.data.length === 0 && (
        <EmptyState
          title="কোনো আবেদন নেই"
          description="এই শিক্ষার্থীর এখনও কোনো আবেদন নেই।"
          action={
            <Link to="/" className="link-button">
              ক্লাস তালিকা থেকে আবেদন করুন →
            </Link>
          }
        />
      )}
      <div className="hold-list">
        {holds.data?.map((h) => (
          <HoldCard key={h.holdId} hold={{ ...h, studentId }} onChanged={() => void holds.refresh()} showLink />
        ))}
      </div>
    </section>
  )
}
