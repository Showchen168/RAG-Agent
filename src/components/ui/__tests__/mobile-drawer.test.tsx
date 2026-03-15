import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MobileDrawer } from '../mobile-drawer'

describe('MobileDrawer', () => {
  it('renders children when open', () => {
    render(
      <MobileDrawer open={true} onClose={jest.fn()} side="bottom" title="Test">
        <div>Drawer content</div>
      </MobileDrawer>
    )
    expect(screen.getByText('Drawer content')).toBeInTheDocument()
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <MobileDrawer open={false} onClose={jest.fn()} side="bottom" title="Test">
        <div>Hidden content</div>
      </MobileDrawer>
    )
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn()
    render(
      <MobileDrawer open={true} onClose={onClose} side="bottom" title="Test">
        <div>Content</div>
      </MobileDrawer>
    )
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders bottom variant with correct classes', () => {
    render(
      <MobileDrawer open={true} onClose={jest.fn()} side="bottom" title="Bottom">
        <div>Bottom content</div>
      </MobileDrawer>
    )
    const panel = screen.getByTestId('drawer-panel')
    expect(panel.className).toContain('bottom-0')
  })

  it('renders right variant with correct classes', () => {
    render(
      <MobileDrawer open={true} onClose={jest.fn()} side="right" title="Right">
        <div>Right content</div>
      </MobileDrawer>
    )
    const panel = screen.getByTestId('drawer-panel')
    expect(panel.className).toContain('right-0')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn()
    render(
      <MobileDrawer open={true} onClose={onClose} side="bottom" title="Test">
        <div>Content</div>
      </MobileDrawer>
    )
    fireEvent.click(screen.getByLabelText('關閉'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
