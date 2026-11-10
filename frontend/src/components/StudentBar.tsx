import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from './arc/input/input'
import { Badge } from './arc/badge/badge'
import { isValidStudentId, useStudent } from '../lib/student'

/** Top-of-page field for the 17-digit birth registration number (the student's identity). */
export function StudentBar() {
  const { studentId, setStudentId } = useStudent()
  const [draft, setDraft] = useState(studentId)

  const trimmed = draft.trim()
  let error = ''
  if (trimmed && /[^0-9]/.test(trimmed)) error = 'শুধু ইংরেজি অঙ্ক (0-9) লিখুন।'
  else if (trimmed && trimmed.length !== 17) error = `ঠিক ১৭টি অঙ্ক লাগবে (এখন ${trimmed.length}টি)।`

  const onChange = (v: string) => {
    setDraft(v)
    const t = v.trim()
    setStudentId(isValidStudentId(t) ? t : '')
  }

  return (
    <div className="student-bar">
      <div className="student-input">
        <Input
          id="student-id"
          label="শিক্ষার্থীর জন্মনিবন্ধন নম্বর (১৭ অঙ্ক)"
          description={error || studentId ? undefined : 'আবেদন করতে ও নিজের আবেদন দেখতে নম্বরটি দিন।'}
          error={error || undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder="যেমন: 20152691234567890"
          value={draft}
          maxLength={20}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {studentId && (
        <div className="student-status">
          <Badge tone="success" dot pill data-testid="active-student">
            সক্রিয় শিক্ষার্থী: {studentId}
          </Badge>
          <Link to="/me" className="subtle-link">
            আমার আবেদন দেখুন →
          </Link>
        </div>
      )}
    </div>
  )
}
