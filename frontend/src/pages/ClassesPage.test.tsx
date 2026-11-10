import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClassesPage } from './ClassesPage'
import { jsonResponse, renderWithProviders } from '../test/utils'

const cls = (available: number) => ({
  id: 'c_1',
  name: 'Class 6 - Morning Shift',
  totalSeats: 120,
  heldSeats: 15,
  confirmedSeats: 120 - 15 - available,
  availableSeats: available,
})

function mockApi(handler: (url: string, init?: RequestInit) => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => handler(String(input), init))
}

describe('ClassesPage', () => {
  it('shows seat counts and refreshes them automatically', async () => {
    let available = 25
    mockApi((url) => (url.endsWith('/classes') ? jsonResponse([cls(available)]) : jsonResponse([])))
    renderWithProviders(<ClassesPage />)

    const row = await screen.findByTestId('class-row-c_1')
    expect(within(row).getByText('25')).toBeInTheDocument()

    available = 24
    await waitFor(() => expect(within(screen.getByTestId('class-row-c_1')).getByText('24')).toBeInTheDocument(), {
      timeout: 5000,
    })
  })

  it('explains a full class in plain language when applying fails with 409', async () => {
    mockApi((url, init) => {
      if (url.endsWith('/holds') && init?.method === 'POST') return jsonResponse({ error: 'SEATS_FULL', message: 'No seats' }, 409)
      return url.endsWith('/classes') ? jsonResponse([cls(1)]) : jsonResponse([])
    })
    renderWithProviders(<ClassesPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'আবেদন করুন' }))
    expect(await screen.findByText(/এই ক্লাসে এখন কোনো আসন খালি নেই/)).toBeInTheDocument()
  })

  it('shows a server-down message instead of a blank page', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    renderWithProviders(<ClassesPage />)
    expect(await screen.findByText(/সার্ভারের সঙ্গে সংযোগ করা যাচ্ছে না/)).toBeInTheDocument()
  })
})
