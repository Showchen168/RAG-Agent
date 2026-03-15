import { Suspense } from 'react'
import { NexusMindChat } from '@/components/crayon/nexusmind-chat'
import { Loader2 } from 'lucide-react'

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>}>
      <NexusMindChat />
    </Suspense>
  )
}
