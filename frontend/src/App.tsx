import { Component, type ReactNode } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { StudentBar } from './components/StudentBar'
import { ClassesPage } from './pages/ClassesPage'
import { AdminPage } from './pages/AdminPage'
import { HoldPage } from './pages/HoldPage'
import { MyHoldsPage } from './pages/MyHoldsPage'
import { StudentProvider } from './lib/student'
import { Alert } from './components/Alert'

/** Last line of defence: a rendering bug shows a message instead of a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <Alert kind="error">
          পাতাটি দেখাতে একটি সমস্যা হয়েছে। <button onClick={() => window.location.reload()}>আবার লোড করুন</button>
        </Alert>
      )
    return this.props.children
  }
}

export default function App() {
  return (
    <StudentProvider>
      <header className="app-header">
        <h1>স্কুল ভর্তি সিস্টেম</h1>
        <StudentBar />
        <nav>
          <NavLink to="/" end>
            ক্লাস তালিকা
          </NavLink>
          <NavLink to="/me">আমার আবেদন</NavLink>
          <NavLink to="/admin">ক্লাস তৈরি (Admin)</NavLink>
        </nav>
      </header>
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
    </StudentProvider>
  )
}
