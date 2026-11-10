// Thin client for the admission API. Every failure becomes an ApiError with a message
// a parent can understand (Bengali), so no screen ever has to show a raw error.

export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'

export interface ClassSummary {
  id: string
  name: string
  totalSeats: number
  heldSeats: number
  confirmedSeats: number
  availableSeats: number
}

export interface CreatedClass {
  id: string
  name: string
  totalSeats: number
}

export interface Hold {
  holdId: string
  classId: string
  className?: string
  studentId?: string
  status: HoldStatus
  expiresAt: string
}

export interface ConfirmResult {
  holdId: string
  status: HoldStatus
}

declare global {
  interface Window {
    __APP_CONFIG__?: { API_BASE_URL?: string }
  }
}

/** Runtime config (container env) wins, then build-time VITE_API_BASE_URL, then the default. */
export function apiBaseUrl(): string {
  const runtime = typeof window !== 'undefined' ? window.__APP_CONFIG__?.API_BASE_URL : undefined
  const url = runtime || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
  return url.replace(/\/+$/, '')
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export const NETWORK_ERROR = 'NETWORK_ERROR'
export const TIMEOUT_ERROR = 'TIMEOUT'

const MESSAGES: Record<string, string> = {
  SEATS_FULL: 'দুঃখিত, এই ক্লাসে এখন কোনো আসন খালি নেই।',
  DUPLICATE_APPLICATION: 'এই শিক্ষার্থীর এই ক্লাসে ইতিমধ্যে একটি চলমান আবেদন আছে। "আমার আবেদন" পাতায় দেখুন।',
  ALREADY_ADMITTED: 'এই শিক্ষার্থীর এই ক্লাসে ভর্তি ইতিমধ্যে নিশ্চিত হয়েছে।',
  HOLD_EXPIRED: 'আবেদনের মেয়াদ শেষ হয়ে গেছে, আসনটি ছেড়ে দেওয়া হয়েছে। চাইলে আবার আবেদন করুন।',
  HOLD_CANCELLED: 'এই আবেদনটি বাতিল করা হয়েছে, তাই আর ভর্তি ফি দেওয়া যাবে না।',
  HOLD_ALREADY_CONFIRMED: 'ভর্তি ইতিমধ্যে নিশ্চিত (ফি পরিশোধিত), তাই এখান থেকে বাতিল করা যাবে না।',
  NOT_YOUR_HOLD: 'এই আবেদনটি অন্য শিক্ষার্থীর। উপরে সঠিক জন্মনিবন্ধন নম্বর দিন।',
  MISSING_STUDENT_ID: 'আগে উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্মনিবন্ধন নম্বর দিন।',
  INVALID_STUDENT_ID: 'জন্মনিবন্ধন নম্বর অবশ্যই ঠিক ১৭টি অঙ্কের হতে হবে।',
  CLASS_NOT_FOUND: 'ক্লাসটি খুঁজে পাওয়া যায়নি। হয়তো লিংকটি ভুল।',
  HOLD_NOT_FOUND: 'আবেদনটি খুঁজে পাওয়া যায়নি। হয়তো লিংকটি ভুল।',
  INVALID_JSON: 'পাঠানো তথ্য সঠিক ফরম্যাটে নেই।',
  DATABASE_UNAVAILABLE: 'সার্ভারের ডাটাবেস সাময়িকভাবে বন্ধ আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
  INTERNAL_ERROR: 'সার্ভারে একটি অপ্রত্যাশিত সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
  [NETWORK_ERROR]: 'সার্ভারের সঙ্গে সংযোগ করা যাচ্ছে না। সার্ভার চালু আছে কি না বা ইন্টারনেট সংযোগ দেখুন, তারপর আবার চেষ্টা করুন।',
  [TIMEOUT_ERROR]: 'সার্ভার সাড়া দিতে অনেক সময় নিচ্ছে। একটু পরে আবার চেষ্টা করুন।',
}

/** Builds the user-facing text for an error code; unknown codes fall back by HTTP status. */
export function friendlyMessage(status: number, code: string, serverMessage?: string): string {
  if (MESSAGES[code]) return MESSAGES[code]
  if (code === 'VALIDATION_FAILED') return `তথ্য সঠিক নয়: ${serverMessage ?? ''}`.trim()
  if (status === 404) return 'যা খুঁজছেন তা পাওয়া যায়নি।'
  if (status >= 500) return MESSAGES.INTERNAL_ERROR
  if (status === 400) return `অনুরোধটি সঠিক নয়${serverMessage ? `: ${serverMessage}` : '।'}`
  return serverMessage || 'একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।'
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return MESSAGES.INTERNAL_ERROR
}

const TIMEOUT_MS = 15000

async function request<T>(method: string, path: string, opts: { studentId?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.studentId) headers['X-Student-Id'] = opts.studentId

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    })
  } catch (e) {
    const code = (e as Error)?.name === 'AbortError' ? TIMEOUT_ERROR : NETWORK_ERROR
    throw new ApiError(0, code, MESSAGES[code])
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 204) return undefined as T

  let data: unknown = null
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; message?: string }
    const code = body.error ?? `HTTP_${res.status}`
    throw new ApiError(res.status, code, friendlyMessage(res.status, code, body.message))
  }
  return data as T
}

const enc = encodeURIComponent

export const api = {
  listClasses: () => request<ClassSummary[]>('GET', '/classes'),
  getClass: (id: string) => request<ClassSummary>('GET', `/classes/${enc(id)}`),
  createClass: (name: string, totalSeats: number) =>
    request<CreatedClass>('POST', '/classes', { body: { name, totalSeats } }),
  createHold: (classId: string, studentId: string) =>
    request<Hold>('POST', `/classes/${enc(classId)}/holds`, { studentId }),
  getHold: (holdId: string) => request<Hold>('GET', `/holds/${enc(holdId)}`),
  confirmHold: (holdId: string, studentId: string) =>
    request<ConfirmResult>('POST', `/holds/${enc(holdId)}/confirm`, { studentId }),
  cancelHold: (holdId: string, studentId: string) =>
    request<void>('DELETE', `/holds/${enc(holdId)}`, { studentId }),
  myHolds: (studentId: string) => request<Hold[]>('GET', '/me/holds', { studentId }),
}
