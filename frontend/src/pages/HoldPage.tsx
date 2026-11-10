import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { usePolling } from '../lib/hooks'
import { HoldCard } from '../components/HoldCard'
import { Alert, StaleNotice } from '../components/Alert'
import { Skeleton } from '../components/arc/skeleton/skeleton'

/** One application: status, time left, pay / cancel. */
export function HoldPage() {
  const { holdId = '' } = useParams()
  const hold = usePolling(() => api.getHold(holdId), 3000, [holdId])

  return (
    <section className="narrow">
      {hold.loading && !hold.data && <Skeleton label="আবেদন লোড হচ্ছে" lines={5} />}
      {hold.data ? (
        <>
          <StaleNotice error={hold.error} lastUpdated={hold.lastUpdated} />
          <HoldCard hold={hold.data} onChanged={() => void hold.refresh()} />
        </>
      ) : (
        <Alert kind="error" title="আবেদন দেখানো যাচ্ছে না">
          {hold.error?.message}
        </Alert>
      )}
      <p className="links">
        <Link to="/me">← আমার সব আবেদন</Link>
        <Link to="/">ক্লাস তালিকা</Link>
      </p>
    </section>
  )
}
