import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { AppSidebar } from '@/components/layout/app-sidebar'
import Cookies from 'js-cookie'
import { FeedQueryProvider } from '@/context/feed-query-provider'
import { SearchProvider } from '@/context/search-context'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarResizeHandle } from '@/components/layout/sidebar-resize-handle'
import SkipToMain from '@/components/skip-to-main'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const { isLogged } = context.authentication
    if (!isLogged()) {
      throw redirect({ to: '/sign-in' })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const defaultOpen = Cookies.get('sidebar_state') !== 'false'
  
  return (
    <SearchProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <FeedQueryProvider>
          <SkipToMain />
          <AppSidebar />
          
          {/* Handle de redimensionnement pour la sidebar */}
          <SidebarResizeHandle />
          
          <div
            id='content'
            className={cn(
              'flex-1 min-w-0', // utilise flex-1 pour prendre l'espace restant
              'flex flex-col',
              'group-data-[scroll-locked=1]/body:h-full',
              'has-[main.fixed-main]:group-data-[scroll-locked=1]/body:h-svh',
            )}
            style={{
              // Use inline styles for safe area to ensure they're always recalculated
              // This is more reliable than Tailwind classes for dynamic viewport changes
              height: 'calc(100svh - env(safe-area-inset-top, 0px) - calc(env(safe-area-inset-bottom, 0px) / 2))',
              paddingTop: 'env(safe-area-inset-top, 0px)',
            }}
          >
            <Outlet />
          </div>
        </FeedQueryProvider>
      </SidebarProvider>
    </SearchProvider>
  )
}
