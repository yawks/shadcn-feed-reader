/**
 * Subscribe Button Component
 * Button placed at the bottom of the sidebar to open the feed directory
 */

import { Button } from '@/components/ui/button'
import { FeedDirectoryDialog } from './feed-directory-dialog'
import { Plus } from 'lucide-react'
import { useState } from 'react'

export function SubscribeButton() {
  const [dialogOpen, setDialogOpen] = useState(false)
  
  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        className="w-full justify-start gap-2"
        variant="outline"
      >
        <Plus className="h-4 w-4" />
        <span>Subscribe to Feeds</span>
      </Button>
      
      <FeedDirectoryDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
