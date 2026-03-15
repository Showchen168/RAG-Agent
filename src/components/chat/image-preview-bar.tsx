'use client'

import { X } from 'lucide-react'
import type { AttachedImage } from '@/hooks/use-image-attach'

interface ImagePreviewBarProps {
  images: AttachedImage[]
  onRemove: (id: string) => void
}

export function ImagePreviewBar({ images, onRemove }: ImagePreviewBarProps) {
  if (images.length === 0) return null

  return (
    <div className="flex gap-2 px-4 py-2">
      {images.map((img) => (
        <div
          key={img.id}
          className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 flex-shrink-0"
        >
          <img
            src={img.previewUrl}
            alt={img.fileName}
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(img.id)}
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            title="移除圖片"
          >
            <X className="w-3 h-3" />
          </button>
          <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center py-0.5 truncate">
            {(img.size / 1024).toFixed(0)}KB
          </div>
        </div>
      ))}
    </div>
  )
}
