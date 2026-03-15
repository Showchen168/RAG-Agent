'use client'

import { useState, useCallback, useRef } from 'react'
import { generateUUID } from '@/lib/uuid'

export interface AttachedImage {
  id: string
  base64: string      // 純 base64（不含 data: 前綴）
  mediaType: string   // 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  previewUrl: string  // data URL，用於 <img> 預覽
  fileName: string
  size: number        // bytes
}

const MAX_IMAGES = 3
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export function useImageAttach() {
  const [images, setImages] = useState<AttachedImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateAndConvert = useCallback(async (file: File): Promise<AttachedImage | null> => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(`不支援的圖片格式。支援 PNG、JPG、GIF、WebP。`)
      return null
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`圖片大小超過 5MB 限制（${(file.size / 1024 / 1024).toFixed(1)}MB）`)
      return null
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.split(',')[1]
        resolve({
          id: generateUUID(),
          base64,
          mediaType: file.type,
          previewUrl: dataUrl,
          fileName: file.name,
          size: file.size,
        })
      }
      reader.onerror = () => {
        setError('圖片讀取失敗')
        resolve(null)
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const addImages = useCallback(async (files: File[]) => {
    setError(null)
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) {
      setError(`最多只能附加 ${MAX_IMAGES} 張圖片`)
      return
    }

    const toProcess = files.slice(0, remaining)
    const results = await Promise.all(toProcess.map(validateAndConvert))
    const valid = results.filter((r): r is AttachedImage => r !== null)

    if (valid.length > 0) {
      setImages((prev) => [...prev, ...valid])
    }
  }, [images.length, validateAndConvert])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
    setError(null)
  }, [])

  const clearImages = useCallback(() => {
    setImages([])
    setError(null)
  }, [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) {
      addImages(files)
    }
    // 重置 input 以允許重複選擇同一檔案
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [addImages])

  const handlePasteImages = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imageFiles = items
      .filter((item) => item.kind === 'file' && ACCEPTED_TYPES.includes(item.type))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)

    if (imageFiles.length > 0) {
      e.preventDefault()
      addImages(imageFiles)
    }
    // 非圖片 paste 不攔截，讓文字正常貼上
  }, [addImages])

  return {
    images,
    error,
    fileInputRef,
    hasImages: images.length > 0,
    canAddMore: images.length < MAX_IMAGES,
    addImages,
    removeImage,
    clearImages,
    openFilePicker,
    handleFileChange,
    handlePasteImages,
  }
}
