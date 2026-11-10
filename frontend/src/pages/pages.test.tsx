import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { AdminPage } from './AdminPage'
import { HoldPage } from './HoldPage'
import { MyHoldsPage } from './MyHoldsPage'
import { HoldCard } from '../components/HoldCard'
import { jsonResponse, renderWithProviders, STUDENT } from '../test/utils'

type Handler = (url: string, init?: RequestInit) => Response
const mockApi = (handler: Handler) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => handler(String(input), init))

describe('AdminPage', () => {
  it('validates input before calling the API', async () => {
    const fetchMock = mockApi(() => jsonResponse([]))
    renderWithProviders(<AdminPage />)
    await userEvent.click(screen.getByRole('button', { name: 'ক্লাস তৈরি করুন' }))
    expect(await screen.findByText(/ক্লাসের নাম লিখুন/)).toBeInTheDocument()
    expect(screen.getByText(/আসনসংখ্যা একটি পূর্ণ সংখ্যা হতে হবে/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('ক্লাসের নাম'), 'Class 6 - Morning Shift')
    await userEvent.type(screen.getByLabelText('মোট আসনসংখ্যা'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'ক্লাস তৈরি করুন' }))
    expect(await screen.findByText(/১ থেকে ১০০০০০-এর মধ্যে/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('creates a class with the exact contract body and clears the form', async () => {
    const fetchMock = mockApi((url, init) =>
      init?.method === 'POST' ? jsonResponse({ id: 'c_9', name: 'Class 6 - Day Shift', totalSeats: 60 }, 201) : jsonResponse([]),
    )
    renderWithProviders(<AdminPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Class 6 - Day Shift' })) // example chip fills the name
    await userEvent.type(screen.getByLabelText('মোট আসনসংখ্যা'), '60')
    await userEvent.click(screen.getByRole('button', { name: 'ক্লাস তৈরি করুন' }))

    await waitFor(() => expect(screen.getByLabelText('মোট আসনসংখ্যা')).toHaveValue(''))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(String(post[0])).toMatch(/\/classes$/)
    expect(JSON.parse(String(post[1]!.body))).toEqual({ name: 'Class 6 - Day Shift', totalSeats: 60 })
  })

  it('shows the server error when creation fails', async () => {
    mockApi((url, init) =>
      init?.method === 'POST' ? jsonResponse({ error: 'DATABASE_UNAVAILABLE', message: 'db' }, 503) : jsonResponse([]),
    )
    renderWithProviders(<AdminPage />)
    await userEvent.type(screen.getByLabelText('ক্লাসের নাম'), 'X')
    await userEvent.type(screen.getByLabelText('মোট আসনসংখ্যা'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'ক্লাস তৈরি করুন' }))
    expect(await screen.findByText(/ডাটাবেস সাময়িকভাবে বন্ধ/)).toBeInTheDocument()
  })
})

describe('HoldPage', () => {
  const renderAt = (id: string) =>
    renderWithProviders(
      <Routes>
        <Route path="/holds/:holdId" element={<HoldPage />} />
      </Routes>,
      { route: `/holds/${id}` },
    )

  it('explains an unknown application instead of rendering a blank page', async () => {
    mockApi(() => jsonResponse({ error: 'HOLD_NOT_FOUND', message: 'nope' }, 404))
    renderAt('h_missing')
    expect(await screen.findByText(/আবেদনটি খুঁজে পাওয়া যায়নি/)).toBeInTheDocument()
  })

  it('keeps showing the application with a warning when a refresh fails', async () => {
    let fail = false
    mockApi(() => {
      if (fail) throw new TypeError('Failed to fetch')
      return jsonResponse({ holdId: 'h_1', classId: 'c_1', className: 'Class 6 - Morning Shift', studentId: STUDENT, status: 'HELD', expiresAt: new Date(Date.now() + 300_000).toISOString() })
    })
    renderAt('h_1')
    expect(await screen.findByText('Class 6 - Morning Shift')).toBeInTheDocument()
    fail = true
    expect(await screen.findByText(/হালনাগাদ করা যাচ্ছে না/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Class 6 - Morning Shift')).toBeInTheDocument() // stale data still visible
  })
})

describe('MyHoldsPage', () => {
  it('asks for the student id when none is set', () => {
    const fetchMock = mockApi(() => jsonResponse([]))
    renderWithProviders(<MyHoldsPage />, { studentId: '' })
    expect(screen.getByText('জন্মনিবন্ধন নম্বর দিন')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("lists the student's applications with their statuses", async () => {
    mockApi((url, init) => {
      expect((init!.headers as Record<string, string>)['X-Student-Id']).toBe(STUDENT)
      return jsonResponse([
        { holdId: 'h_a', classId: 'c_1', className: 'Class 6 - Morning Shift', status: 'CONFIRMED', expiresAt: new Date().toISOString() },
        { holdId: 'h_b', classId: 'c_2', className: 'Class 6 - Day Shift', status: 'EXPIRED', expiresAt: new Date().toISOString() },
      ])
    })
    renderWithProviders(<MyHoldsPage />)
    const statuses = await screen.findAllByTestId('hold-status')
    expect(statuses.map((s) => s.textContent)).toEqual([expect.stringContaining('CONFIRMED'), expect.stringContaining('EXPIRED')])
  })
})

describe('HoldCard actions', () => {
  const held = { holdId: 'h_1', classId: 'c_1', className: 'Class 6', studentId: STUDENT, status: 'HELD' as const, expiresAt: new Date(Date.now() + 120_000).toISOString() }

  it('pays with the student header and reports the parent to refresh', async () => {
    const fetchMock = mockApi(() => jsonResponse({ holdId: 'h_1', status: 'CONFIRMED' }))
    const onChanged = vi.fn()
    renderWithProviders(<HoldCard hold={held} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole('button', { name: 'ভর্তি ফি দিন' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/holds\/h_1\/confirm$/)
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>)['X-Student-Id']).toBe(STUDENT)
  })

  it('shows why paying failed (expired on the server)', async () => {
    mockApi(() => jsonResponse({ error: 'HOLD_EXPIRED', message: 'expired' }, 409))
    renderWithProviders(<HoldCard hold={held} />)
    await userEvent.click(screen.getByRole('button', { name: 'ভর্তি ফি দিন' }))
    expect(await screen.findByText(/আবেদনের মেয়াদ শেষ হয়ে গেছে/)).toBeInTheDocument()
  })

  it('cancels only after the user confirms', async () => {
    const fetchMock = mockApi(() => new Response(null, { status: 204 }))
    renderWithProviders(<HoldCard hold={held} />)
    await userEvent.click(screen.getByRole('button', { name: 'বাতিল' }))
    expect(fetchMock).not.toHaveBeenCalled() // first click only asks
    const yes = await screen.findByRole('button', { name: 'হ্যাঁ, বাতিল' })
    // ConfirmMorph ignores a confirm that lands right after the prompt opens (guards double-clicks).
    await new Promise((r) => setTimeout(r, 450))
    await userEvent.click(yes)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/holds\/h_1$/)
    expect(init!.method).toBe('DELETE')
  })

  it('renders class names as text, never as HTML', () => {
    renderWithProviders(<HoldCard hold={{ ...held, className: '<img src=x onerror=alert(1)>' }} />)
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })
})
