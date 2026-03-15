import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null }),
        }),
        or: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    }),
  }),
}))

jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}))

jest.mock('@/components/settings/telegram-integration', () => ({
  __esModule: true,
  default: () => <div data-testid="telegram-integration">Telegram</div>,
}))

jest.mock('@/components/settings/telegram-bot-config', () => ({
  __esModule: true,
  default: () => <div data-testid="telegram-bot-config">Bot Config</div>,
}))

import SettingsPage from '../page'

describe('SettingsPage mobile responsive', () => {
  it('renders tab container with overflow-x-auto for mobile scrollability', () => {
    render(<SettingsPage />)
    // Find the tab row - it contains the "個人設定" text
    const personalTab = screen.getByText('個人設定')
    const tabContainer = personalTab.closest('button')?.parentElement
    expect(tabContainer?.className).toContain('overflow-x-auto')
  })

  it('renders page container with responsive padding', () => {
    render(<SettingsPage />)
    const heading = screen.getByText('設定')
    const container = heading.parentElement
    expect(container?.className).toContain('px-4')
    expect(container?.className).toContain('md:px-6')
  })
})
