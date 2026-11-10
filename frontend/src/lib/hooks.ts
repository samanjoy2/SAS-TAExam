import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

/** Current time, re-rendered every `intervalMs`. Drives countdowns and client-side expiry. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, intervalMs)
    // Background tabs throttle timers; catch up the moment the tab is shown again.
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])
  return now
}

export interface PollState<T> {
  data: T | undefined
  error: ApiError | undefined
  loading: boolean
  lastUpdated: number | undefined
  refresh: () => Promise<void>
}

/**
 * Fetches immediately and then every `intervalMs`. Keeps the last good data when a poll fails,
 * so a temporary outage shows a warning instead of blanking the page.
 * Pass `enabled = false` to pause (e.g. no student id yet).
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[], enabled = true): PollState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<ApiError>()
  const [loading, setLoading] = useState(enabled)
  const [lastUpdated, setLastUpdated] = useState<number>()
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const generation = useRef(0)

  const run = useCallback(async () => {
    const gen = generation.current
    try {
      const result = await fetcherRef.current()
      if (gen !== generation.current) return
      setData(result)
      setError(undefined)
      setLastUpdated(Date.now())
    } catch (e) {
      if (gen !== generation.current) return
      setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', String(e)))
    } finally {
      if (gen === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    generation.current++
    setData(undefined)
    setError(undefined)
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    void run()
    const id = setInterval(() => void run(), intervalMs)
    // Refetch right away when a backgrounded tab comes back (its interval may have been throttled).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      generation.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, run, ...deps])

  return { data, error, loading, lastUpdated, refresh: run }
}
