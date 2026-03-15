import { NexusMindChat } from '@/components/crayon/nexusmind-chat'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params
  return <NexusMindChat conversationId={id} />
}
