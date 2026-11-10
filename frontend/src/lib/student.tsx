import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'admission.studentId'

export function isValidStudentId(v: string): boolean {
  return /^[0-9]{17}$/.test(v)
}

function load(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY) ?? ''
    return isValidStudentId(v) ? v : ''
  } catch {
    return ''
  }
}

interface StudentCtx {
  /** The active 17-digit id, or '' when none/invalid. */
  studentId: string
  setStudentId: (id: string) => void
}

const Ctx = createContext<StudentCtx>({ studentId: '', setStudentId: () => {} })

/** Holds the current student id and persists it so applications survive refresh / browser restart. */
export function StudentProvider({ children }: { children: ReactNode }) {
  const [studentId, setState] = useState(load)
  const setStudentId = useCallback((id: string) => {
    setState(id)
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }, [])
  const value = useMemo(() => ({ studentId, setStudentId }), [studentId, setStudentId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStudent(): StudentCtx {
  return useContext(Ctx)
}
