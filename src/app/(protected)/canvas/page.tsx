import { Suspense } from 'react'
import { CanvasLayout } from '@/components/canvas/canvas-layout'
import { Loader2 } from 'lucide-react'

export default function CanvasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      }
    >
      <CanvasLayout />
    </Suspense>
  )
}
