import Folder from '@/features/feeds'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/feeds/$feedsId')({
  component: Folder,
})
