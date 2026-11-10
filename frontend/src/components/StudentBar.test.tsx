import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StudentBar } from './StudentBar'
import { renderWithProviders } from '../test/utils'

describe('StudentBar', () => {
  it('rejects ids that are not exactly 17 digits', async () => {
    renderWithProviders(<StudentBar />, { studentId: '' })
    const input = screen.getByLabelText(/জন্মনিবন্ধন নম্বর/)
    await userEvent.type(input, '12345')
    expect(screen.getByRole('alert')).toHaveTextContent('ঠিক ১৭টি অঙ্ক লাগবে')
    await userEvent.type(input, 'ab')
    expect(screen.getByRole('alert')).toHaveTextContent('শুধু ইংরেজি অঙ্ক')
    expect(localStorage.getItem('admission.studentId')).toBeNull()
  })

  it('persists a valid id so it survives a page refresh', async () => {
    renderWithProviders(<StudentBar />, { studentId: '' })
    await userEvent.type(screen.getByLabelText(/জন্মনিবন্ধন নম্বর/), '20152691234567890')
    expect(localStorage.getItem('admission.studentId')).toBe('20152691234567890')
    expect(screen.getByText(/সক্রিয় শিক্ষার্থী/)).toBeInTheDocument()
  })
})
