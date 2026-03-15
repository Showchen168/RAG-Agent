import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('@/components/chat/sidebar', () => ({
  Sidebar: ({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) => (
    <div data-testid="sidebar" data-collapsed={collapsed}>
      <button onClick={onToggleCollapse}>Toggle</button>
    </div>
  ),
}))

jest.mock('@/components/chat/chat-session-context', () => ({
  ChatSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { ResponsiveLayout } from '../responsive-layout'

describe('ResponsiveLayout', () => {
  it('renders mobile header with hamburger button', () => {
    render(<ResponsiveLayout><div>Content</div></ResponsiveLayout>)
    const header = document.querySelector('header')
    expect(header).toBeInTheDocument()
    expect(header?.className).toContain('md:hidden')
  })

  it('hamburger button has minimum 44px touch target', () => {
    render(<ResponsiveLayout><div>Content</div></ResponsiveLayout>)
    const btn = document.querySelector('header button')
    expect(btn?.className).toContain('min-h-[44px]')
    expect(btn?.className).toContain('min-w-[44px]')
  })

  it('opens mobile sidebar on hamburger click', () => {
    render(<ResponsiveLayout><div>Content</div></ResponsiveLayout>)
    const menuBtn = document.querySelector('header button')
    fireEvent.click(menuBtn!)
    const overlay = document.querySelector('.fixed.inset-0.z-40')
    expect(overlay).toBeInTheDocument()
  })

  it('closes mobile sidebar on backdrop click', () => {
    render(<ResponsiveLayout><div>Content</div></ResponsiveLayout>)
    fireEvent.click(document.querySelector('header button')!)
    // The backdrop has bg-black/50
    const backdrops = document.querySelectorAll('.fixed.inset-0')
    // Find the backdrop (not the container)
    let backdrop: Element | null = null
    backdrops.forEach(el => {
      if (el.className.includes('bg-black')) backdrop = el
    })
    fireEvent.click(backdrop!)
    expect(document.querySelector('.fixed.inset-0.z-40')).not.toBeInTheDocument()
  })

  it('adds backdrop-blur-sm to sidebar overlay', () => {
    render(<ResponsiveLayout><div>Content</div></ResponsiveLayout>)
    fireEvent.click(document.querySelector('header button')!)
    const backdrops = document.querySelectorAll('.fixed.inset-0')
    let hasBlur = false
    backdrops.forEach(el => {
      if (el.className.includes('backdrop-blur-sm')) hasBlur = true
    })
    expect(hasBlur).toBe(true)
  })
})
