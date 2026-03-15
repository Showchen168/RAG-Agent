// Mock CSS imports and next/font/google to avoid Jest parse errors
jest.mock('../globals.css', () => ({}))
jest.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}))
jest.mock('../providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => children,
}))

import { viewport } from '../layout'

describe('RootLayout viewport', () => {
  it('exports viewport with device-width and initial-scale', () => {
    expect(viewport).toBeDefined()
    expect(viewport.width).toBe('device-width')
    expect(viewport.initialScale).toBe(1)
  })
})
