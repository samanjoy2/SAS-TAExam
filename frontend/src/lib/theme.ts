import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '../components/arc/theme-switch/theme-switch'

const KEY = 'admission.theme'

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Light/dark theme applied as data-theme on <html> (Arc UI tokens switch on it), remembered per browser. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(initial)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* ignore */
    }
  }, [])
  return { theme, setTheme }
}
