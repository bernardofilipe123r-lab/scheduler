import { Inbox } from 'lucide-react'

interface Props {
  status: string
}

export function EmptyState({ status }: Props) {
  const messages: Record<string, { title: string; subtitle: string }> = {
    pending: {
      title: 'No pending content',
      subtitle: 'Toby will generate content based on your schedule. Check back soon!',
    },
    approved: {
      title: 'No approved content yet',
      subtitle: 'Approve pending items to schedule them for publishing.',
    },
    rejected: {
      title: 'No rejected content',
      subtitle: 'Rejected items will appear here for reference.',
    },
    all: {
      title: 'No content in the pipeline',
      subtitle: 'Create content manually or let Toby generate it automatically.',
    },
  }

  const msg = messages[status] ?? messages.all

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox className="w-12 h-12 text-gray-300 mb-3" />
      <h3 className="text-base font-semibold text-gray-600 mb-1">{msg.title}</h3>
      <p className="text-sm text-gray-400 max-w-sm">{msg.subtitle}</p>
    </div>
  )
}
