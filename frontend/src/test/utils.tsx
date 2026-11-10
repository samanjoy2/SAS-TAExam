import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StudentProvider } from '../lib/student'
import { ToastStackProvider } from '../components/arc/toast-stack/toast-stack'

export const STUDENT = '20152691234567890'

export function renderWithProviders(ui: ReactElement, { route = '/', studentId = STUDENT } = {}) {
  if (studentId) localStorage.setItem('admission.studentId', studentId)
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastStackProvider>
        <StudentProvider>{ui}</StudentProvider>
      </ToastStackProvider>
    </MemoryRouter>,
  )
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
