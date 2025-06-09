import Feeds from '@/features/feeds'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/starred/')({
  component: Feeds,
})