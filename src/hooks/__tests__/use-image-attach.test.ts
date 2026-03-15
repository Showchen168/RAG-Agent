/**
 * use-image-attach.test.ts
 * Tests for image attachment hook: validation, add, remove, clear, limits
 */

import { renderHook, act } from '@testing-library/react'
import { useImageAttach } from '../use-image-attach'

// Mock @/lib/uuid
const mockUUID = jest.fn(() => 'test-uuid-1')
jest.mock('@/lib/uuid', () => ({
  generateUUID: () => mockUUID(),
}))

// Mock FileReader
class MockFileReader {
  result: string | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(file: File) {
    // Simulate async read
    setTimeout(() => {
      this.result = `data:${file.type};base64,dGVzdA==`
      this.onload?.()
    }, 0)
  }
}

Object.defineProperty(global, 'FileReader', {
  value: MockFileReader,
})

function createMockFile(
  name: string,
  size: number,
  type: string
): File {
  const content = new ArrayBuffer(size)
  return new File([content], name, { type })
}

describe('useImageAttach', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUUID.mockReturnValue('test-uuid-1')
  })

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useImageAttach())

    expect(result.current.images).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.hasImages).toBe(false)
    expect(result.current.canAddMore).toBe(true)
  })

  it('should add a valid PNG image', async () => {
    const { result } = renderHook(() => useImageAttach())
    const file = createMockFile('test.png', 1024, 'image/png')

    await act(async () => {
      await result.current.addImages([file])
    })

    expect(result.current.images).toHaveLength(1)
    expect(result.current.images[0]).toMatchObject({
      id: 'test-uuid-1',
      base64: 'dGVzdA==',
      mediaType: 'image/png',
      fileName: 'test.png',
      size: 1024,
    })
    expect(result.current.hasImages).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('should reject unsupported file types', async () => {
    const { result } = renderHook(() => useImageAttach())
    const file = createMockFile('doc.pdf', 1024, 'application/pdf')

    await act(async () => {
      await result.current.addImages([file])
    })

    expect(result.current.images).toHaveLength(0)
    expect(result.current.error).toContain('不支援的圖片格式')
  })

  it('should reject files exceeding 5MB', async () => {
    const { result } = renderHook(() => useImageAttach())
    const file = createMockFile('big.png', 6 * 1024 * 1024, 'image/png')

    await act(async () => {
      await result.current.addImages([file])
    })

    expect(result.current.images).toHaveLength(0)
    expect(result.current.error).toContain('5MB')
  })

  it('should limit to maximum 3 images', async () => {
    let uuidCounter = 0
    mockUUID.mockImplementation(() => `uuid-${++uuidCounter}`)

    const { result } = renderHook(() => useImageAttach())

    // Add 3 images one by one
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.addImages([
          createMockFile(`img${i}.png`, 1024, 'image/png'),
        ])
      })
    }

    expect(result.current.images).toHaveLength(3)
    expect(result.current.canAddMore).toBe(false)

    // Try adding a 4th
    await act(async () => {
      await result.current.addImages([
        createMockFile('img4.png', 1024, 'image/png'),
      ])
    })

    expect(result.current.images).toHaveLength(3)
    expect(result.current.error).toContain('最多只能附加 3 張圖片')
  })

  it('should remove an image by id', async () => {
    mockUUID.mockReturnValue('remove-me')

    const { result } = renderHook(() => useImageAttach())
    const file = createMockFile('test.png', 1024, 'image/png')

    await act(async () => {
      await result.current.addImages([file])
    })

    expect(result.current.images).toHaveLength(1)

    act(() => {
      result.current.removeImage('remove-me')
    })

    expect(result.current.images).toHaveLength(0)
    expect(result.current.hasImages).toBe(false)
  })

  it('should clear all images', async () => {
    let uuidCounter = 0
    mockUUID.mockImplementation(() => `uuid-${++uuidCounter}`)

    const { result } = renderHook(() => useImageAttach())

    await act(async () => {
      await result.current.addImages([
        createMockFile('a.png', 1024, 'image/png'),
        createMockFile('b.jpg', 2048, 'image/jpeg'),
      ])
    })

    expect(result.current.images).toHaveLength(2)

    act(() => {
      result.current.clearImages()
    })

    expect(result.current.images).toHaveLength(0)
    expect(result.current.error).toBeNull()
    expect(result.current.canAddMore).toBe(true)
  })

  it('should accept JPEG, GIF, and WebP formats', async () => {
    let uuidCounter = 0
    mockUUID.mockImplementation(() => `uuid-${++uuidCounter}`)

    const { result } = renderHook(() => useImageAttach())

    const files = [
      createMockFile('photo.jpg', 1024, 'image/jpeg'),
      createMockFile('anim.gif', 2048, 'image/gif'),
      createMockFile('modern.webp', 512, 'image/webp'),
    ]

    await act(async () => {
      await result.current.addImages(files)
    })

    expect(result.current.images).toHaveLength(3)
    expect(result.current.images.map((i) => i.mediaType)).toEqual([
      'image/jpeg',
      'image/gif',
      'image/webp',
    ])
  })

  it('should clear error when adding valid images after error', async () => {
    const { result } = renderHook(() => useImageAttach())

    // Trigger error
    await act(async () => {
      await result.current.addImages([
        createMockFile('bad.pdf', 1024, 'application/pdf'),
      ])
    })
    expect(result.current.error).not.toBeNull()

    mockUUID.mockReturnValue('good-uuid')

    // Add valid image
    await act(async () => {
      await result.current.addImages([
        createMockFile('good.png', 1024, 'image/png'),
      ])
    })
    expect(result.current.error).toBeNull()
    expect(result.current.images).toHaveLength(1)
  })
})
