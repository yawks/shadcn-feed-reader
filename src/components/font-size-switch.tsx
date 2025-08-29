import { IconMinus, IconPlus } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/context/font-size-context'

export function FontSizeSwitch() {
  const { fontSize, increaseFontSize, decreaseFontSize } = useFontSize()

  const fontSizes = ['xs', 'sm', 'base', 'lg', 'xl']
  const currentIndex = fontSizes.indexOf(fontSize)
  const isMinSize = currentIndex === 0
  const isMaxSize = currentIndex === fontSizes.length - 1

  return (
    <div className="flex items-center gap-1 border rounded-full p-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 rounded-full",
          isMinSize && "opacity-50 cursor-not-allowed"
        )}
        onClick={decreaseFontSize}
        disabled={isMinSize}
        title="Decrease font size"
      >
        <IconMinus className="h-3 w-3" />
        <span className="sr-only">Decrease font size</span>
      </Button>
      
      <span className="text-xs px-2 font-medium min-w-[2rem] text-center flex items-center justify-center">
        {fontSize === 'xs' && <span style={{ fontSize: '10px' }}>Aa</span>}
        {fontSize === 'sm' && <span style={{ fontSize: '12px' }}>Aa</span>}
        {fontSize === 'base' && <span style={{ fontSize: '14px' }}>Aa</span>}
        {fontSize === 'lg' && <span style={{ fontSize: '16px' }}>Aa</span>}
        {fontSize === 'xl' && <span style={{ fontSize: '18px' }}>Aa</span>}
      </span>
      
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 rounded-full",
          isMaxSize && "opacity-50 cursor-not-allowed"
        )}
        onClick={increaseFontSize}
        disabled={isMaxSize}
        title="Increase font size"
      >
        <IconPlus className="h-3 w-3" />
        <span className="sr-only">Increase font size</span>
      </Button>
    </div>
  )
}
