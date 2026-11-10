import { describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { HoldCard } from './HoldCard'
import { renderWithProviders, STUDENT } from '../test/utils'

describe('HoldCard', () => {
  it('switches to EXPIRED and disables the pay button when the countdown ends, without reload', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T04:00:00Z'))
    const onChanged = vi.fn()
    renderWithProviders(
      <HoldCard
        hold={{
          holdId: 'h_1',
          classId: 'c_1',
          className: 'Class 6 - Morning Shift',
          studentId: STUDENT,
          status: 'HELD',
          expiresAt: '2026-11-01T04:00:05Z',
        }}
        onChanged={onChanged}
      />,
    )

    expect(screen.getByTestId('hold-status')).toHaveTextContent('HELD')
    expect(screen.getByTestId('countdown')).toHaveTextContent('00:05')
    expect(screen.getByRole('button', { name: 'ভর্তি ফি দিন' })).toBeEnabled()

    act(() => {
      vi.advanceTimersByTime(6000)
    })

    expect(screen.getByTestId('hold-status')).toHaveTextContent('EXPIRED')
    expect(screen.getByRole('button', { name: 'ভর্তি ফি দিন' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'বাতিল' })).toBeDisabled()
    expect(onChanged).toHaveBeenCalled() // parent is told to refetch
  })

  it("does not allow paying for another student's application", () => {
    renderWithProviders(
      <HoldCard
        hold={{
          holdId: 'h_2',
          classId: 'c_1',
          studentId: '20159999999999999',
          status: 'HELD',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }}
      />,
    )
    expect(screen.getByRole('button', { name: 'ভর্তি ফি দিন' })).toBeDisabled()
    expect(screen.getByText(/অন্য শিক্ষার্থীর/)).toBeInTheDocument()
  })

  it('shows confirmed applications with pay disabled', () => {
    renderWithProviders(
      <HoldCard
        hold={{
          holdId: 'h_3',
          classId: 'c_1',
          studentId: STUDENT,
          status: 'CONFIRMED',
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }}
      />,
    )
    expect(screen.getByTestId('hold-status')).toHaveTextContent('CONFIRMED')
    expect(screen.getByRole('button', { name: 'ভর্তি ফি দিন' })).toBeDisabled()
  })
})
