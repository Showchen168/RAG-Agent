import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ModeSwitcher } from '../mode-switcher'
import { useModeStore } from '@/stores/mode-store'

jest.mock('@/stores/mode-store')

describe('ModeSwitcher', () => {
  it('should render chat and canvas buttons', () => {
    ;(useModeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'chat',
      setMode: jest.fn(),
    })

    render(<ModeSwitcher />)
    expect(screen.getByText('對話')).toBeInTheDocument()
    expect(screen.getByText('畫布')).toBeInTheDocument()
  })

  it('should highlight active mode', () => {
    ;(useModeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'canvas',
      setMode: jest.fn(),
    })

    render(<ModeSwitcher />)
    const canvasButton = screen.getByText('畫布').closest('button')
    expect(canvasButton).toHaveClass('bg-blue-50')
  })

  it('should call setMode on button click', () => {
    const setMode = jest.fn()
    ;(useModeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'chat',
      setMode,
    })

    render(<ModeSwitcher />)
    fireEvent.click(screen.getByText('畫布'))
    expect(setMode).toHaveBeenCalledWith('canvas')
  })
})
