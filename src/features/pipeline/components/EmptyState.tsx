import { Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Props {
  status: string
}

interface Message {
  title: string
  subtitle: React.ReactNode
}

export function EmptyState({ status }: Props) {
  const messages: Record<string, Message> = {
    pending_review: {
      title: 'No pending content',
      subtitle: 'Toby will generate content based on your schedule. Check back soon!',
    },
    generating: {
      title: 'Nothing generating right now',
      subtitle: (
        <>
          Wait for Toby to kick in, or{' '}
          <Link to="/creation" className="text-[#006d8f] hover:underline font-medium">
            create content manually
          </Link>{' '}
          in the Creation tab.
        </>
      ),
    },
    scheduled: {
      title: 'No scheduled content',
      subtitle: 'Approve pending items to schedule them for publishing.',
    },
    published: {
      title: 'No published content yet',
      subtitle: 'Published content will appear here after going live.',
    },
    rejected: {
      title: 'No rejected content',
      subtitle: 'Rejected items will appear here for reference.',
    },
    failed: {
      title: 'No failed content',
      subtitle: 'Content that failed generation will appear here.',
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
      <p className="text-sm text-gray-400">{msg.subtitle}</p>
    </div>
  )
}
