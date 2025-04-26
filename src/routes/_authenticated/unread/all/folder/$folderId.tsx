import Feeds from '@/features/feeds'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/unread/all/folder/$folderId')({
  component: () => <Feeds showOnlyUnread={true} showOnlyStarred={false} />,
})
