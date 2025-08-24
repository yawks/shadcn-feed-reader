import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MobileBackButtonProps {
  readonly onBack: () => void
}

export function MobileBackButton({ onBack }: MobileBackButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onBack}
      className="flex items-center gap-2"
    >
      <ArrowLeft size={16} />
    </Button>
  )
}
