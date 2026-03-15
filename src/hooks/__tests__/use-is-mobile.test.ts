import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '../use-is-mobile'

interface MockMql {
  matches: boolean
  media: string
  addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => void
  removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => void
  _fire: (newMatches: boolean) => void
}

function createMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  return jest.fn().mockImplementation((query: string): MockMql => ({
    matches,
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      const idx = listeners.indexOf(cb)
      if (idx > -1) listeners.splice(idx, 1)
    },
    _fire: (newMatches: boolean) => listeners.forEach(cb => cb({ matches: newMatches })),
  }))
}

describe('useIsMobile', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('returns false when screen is >= 768px (desktop)', () => {
    window.matchMedia = createMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('returns true when screen is < 768px (mobile)', () => {
    window.matchMedia = createMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('updates when media query changes', () => {
    const mock = createMatchMedia(false)
    window.matchMedia = mock
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => {
      const mql = mock.mock.results[0].value as MockMql
      mql._fire(true)
    })
    expect(result.current).toBe(true)
  })

  it('cleans up listener on unmount', () => {
    const mock = createMatchMedia(false)
    window.matchMedia = mock
    const { result, unmount } = renderHook(() => useIsMobile())
    unmount()
    const mql = mock.mock.results[0].value as MockMql
    expect(() => mql._fire(true)).not.toThrow()
  })
})
