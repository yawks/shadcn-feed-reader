import Feeds from '@/features/feeds'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/unread/starred/')({
  component: () => <Feeds showOnlyUnread={true} showOnlyStarred={true} />,
})

