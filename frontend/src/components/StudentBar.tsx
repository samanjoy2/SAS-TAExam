import { useState } from 'react'
import { isValidStudentId, useStudent } from '../lib/student'

/** Top-of-page field for the 17-digit birth registration number (the student's identity). */
export function StudentBar() {
  const { studentId, setStudentId } = useStudent()
  const [draft, setDraft] = useState(studentId)

  const trimmed = draft.trim()
  let hint = ''
  if (trimmed && /[^0-9]/.test(trimmed)) hint = 'শুধু ইংরেজি অঙ্ক (0-9) লিখুন।'
  else if (trimmed && trimmed.length !== 17) hint = `ঠিক ১৭টি অঙ্ক লাগবে (এখন ${trimmed.length}টি)।`

  const onChange = (v: string) => {
    setDraft(v)
    const t = v.trim()
    setStudentId(isValidStudentId(t) ? t : '')
  }

  return (
    <div className="student-bar">
      <label htmlFor="student-id">শিক্ষার্থীর জন্মনিবন্ধন নম্বর (১৭ অঙ্ক)</label>
      <input
        id="student-id"
        inputMode="numeric"
        autoComplete="off"
        placeholder="যেমন: 20152691234567890"
        value={draft}
        maxLength={20}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={hint ? true : undefined}
        aria-describedby="student-id-hint"
      />
      <span id="student-id-hint" className={hint ? 'hint error' : 'hint ok'} role={hint ? 'alert' : undefined}>
        {hint || (studentId ? `✔ সক্রিয় শিক্ষার্থী: ${studentId}` : 'আবেদন করতে নম্বরটি দিন।')}
      </span>
    </div>
  )
}
