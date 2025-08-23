import { ResizeHandle } from '@/components/ui/resize-handle'
import { useSidebar } from '@/components/ui/sidebar'
import { useSidebarResize } from '@/hooks/use-sidebar-resize'

export function SidebarResizeHandle() {
  const { state } = useSidebar()
  
  // Hook pour gérer le redimensionnement de la sidebar
  const { handleMouseDown, sidebarWidth } = useSidebarResize({
    sidebarWidthKey: 'sidebar-width',
    defaultSidebarWidth: 280,
    minSidebarWidth: 200,
    maxSidebarWidth: 400
  })

  // Ne pas afficher le handle si la sidebar est réduite
  if (state === 'collapsed') {
    return null
  }

  return (
    <ResizeHandle 
      onMouseDown={handleMouseDown}
      className="fixed top-0 h-full w-3 z-50 bg-transparent hover:bg-border/20 cursor-col-resize hidden md:block"
      style={{ left: `${sidebarWidth - 10}px` }}
    />
  )
}
