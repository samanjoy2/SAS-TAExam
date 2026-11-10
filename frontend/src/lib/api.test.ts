import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import { jsonResponse } from '../test/utils'

describe('api client error handling', () => {
  it('turns a network failure (server down) into a readable message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await api.listClasses().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NETWORK_ERROR')
    expect(err.message).toContain('সার্ভারের সঙ্গে সংযোগ করা যাচ্ছে না')
  })

  it('maps 409 SEATS_FULL to a friendly Bengali message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'SEATS_FULL', message: 'No seats are available in this class.' }, 409),
    )
    const err = await api.createHold('c_1', '20152691234567890').catch((e) => e)
    expect(err.status).toBe(409)
    expect(err.message).toBe('দুঃখিত, এই ক্লাসে এখন কোনো আসন খালি নেই।')
  })

  it('sends the X-Student-Id header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]))
    await api.myHolds('20152691234567890')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/me\/holds$/)
    expect((init!.headers as Record<string, string>)['X-Student-Id']).toBe('20152691234567890')
  })

  it('handles non-JSON error bodies (e.g. proxy 502)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }))
    const err = await api.listClasses().catch((e) => e)
    expect(err.message).toContain('সার্ভারে একটি অপ্রত্যাশিত সমস্যা')
  })
})
