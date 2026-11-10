import { Component, type ReactNode } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { StudentBar } from './components/StudentBar'
import { ClassesPage } from './pages/ClassesPage'
import { AdminPage } from './pages/AdminPage'
import { HoldPage } from './pages/HoldPage'
import { MyHoldsPage } from './pages/MyHoldsPage'
import { StudentProvider } from './lib/student'
import { useTheme } from './lib/theme'
import { Alert } from './components/Alert'
import { Tabs, TabsList, TabsTrigger } from './components/arc/tabs/tabs'
import { ThemeSwitch } from './components/arc/theme-switch/theme-switch'
import { ToastStack, ToastStackProvider } from './components/arc/toast-stack/toast-stack'

/** Last line of defence: a rendering bug shows a message instead of a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <Alert kind="error" title="পাতাটি দেখানো যাচ্ছে না">
          একটি অপ্রত্যাশিত সমস্যা হয়েছে। পাতাটি আবার লোড করুন।
        </Alert>
      )
    return this.props.children
  }
}

const SECTIONS = [
  { value: '/', label: 'ক্লাস তালিকা' },
  { value: '/me', label: 'আমার আবেদন' },
  { value: '/admin', label: 'ক্লাস তৈরি (Admin)' },
]

function Nav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = pathname.startsWith('/holds') ? '/me' : SECTIONS.some((s) => s.value === pathname) ? pathname : '/'
  return (
    <Tabs value={current} onValueChange={(v) => navigate(v)}>
      <TabsList aria-label="পাতা">
        {SECTIONS.map((s) => (
          <TabsTrigger key={s.value} value={s.value}>
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export default function App() {
  const { theme, setTheme } = useTheme()
  return (
    <ToastStackProvider duration={4500}>
      <StudentProvider>
        <header className="app-header">
          <div className="app-header-inner">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                ভ
              </span>
              <div>
                <h1>স্কুল ভর্তি সিস্টেম</h1>
                <p className="muted">আগে আবেদন করলে আগে পাবে</p>
              </div>
            </div>
            <div className="header-nav">
              <Nav />
              <ThemeSwitch
                theme={theme}
                iconOnly
                label={theme === 'light' ? 'ডার্ক মোড চালু করুন' : 'লাইট মোড চালু করুন'}
                onThemeChange={(next) => setTheme(next)}
              />
            </div>
          </div>
        </header>
        <div className="student-strip">
          <StudentBar />
        </div>
        <main>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<ClassesPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/me" element={<MyHoldsPage />} />
              <Route path="/holds/:holdId" element={<HoldPage />} />
              <Route path="*" element={<Alert kind="info">পাতাটি পাওয়া যায়নি।</Alert>} />
            </Routes>
          </ErrorBoundary>
        </main>
        <ToastStack label="বিজ্ঞপ্তি" position="bottom-right" />
      </StudentProvider>
    </ToastStackProvider>
  )
}
