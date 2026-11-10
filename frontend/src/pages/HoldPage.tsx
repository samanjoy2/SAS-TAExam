import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { usePolling } from '../lib/hooks'
import { HoldCard } from '../components/HoldCard'
import { Alert, StaleNotice } from '../components/Alert'

/** One application: status, time left, pay / cancel. */
export function HoldPage() {
  const { holdId = '' } = useParams()
  const hold = usePolling(() => api.getHold(holdId), 3000, [holdId])

  return (
    <section>
      <h2>আবেদন</h2>
      {hold.loading && !hold.data && <p>লোড হচ্ছে…</p>}
      {hold.data ? (
        <>
          <StaleNotice error={hold.error} lastUpdated={hold.lastUpdated} />
          <HoldCard hold={hold.data} onChanged={() => void hold.refresh()} />
        </>
      ) : (
        <Alert kind="error">{hold.error?.message}</Alert>
      )}
      <p>
        <Link to="/me">← আমার সব আবেদন</Link> · <Link to="/">ক্লাস তালিকা</Link>
      </p>
    </section>
  )
}
