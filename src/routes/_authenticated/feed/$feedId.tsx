import Folder from '@/features/feeds'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/feed/$feedId')({
  component: Folder,
})
