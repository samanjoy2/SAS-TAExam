import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom lacks a few browser APIs the animated Arc UI components rely on.
class MockObserver {
  private cb: (entries: unknown[], obs: unknown) => void
  constructor(cb: (entries: unknown[], obs: unknown) => void) {
    this.cb = cb
  }
  observe(target: Element) {
    // Report everything as visible so in-view-gated components (countdown) keep ticking.
    this.cb([{ isIntersecting: true, intersectionRatio: 1, target, contentRect: { width: 100, height: 20 } }], this)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
Object.assign(globalThis, { IntersectionObserver: MockObserver, ResizeObserver: MockObserver })
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
window.scrollTo = (() => {}) as typeof window.scrollTo
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})
