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
              'w-full max-w-full', // suppression de ml-auto
              'peer-data-[state=collapsed]:w-[calc(100%-var(--sidebar-width-icon)-1rem)]',
              'peer-data-[state=expanded]:w-[calc(100%-var(--sidebar-width))]',
              'flex h-svh flex-col',
              'group-data-[scroll-locked=1]/body:h-full',
              'has-[main.fixed-main]:group-data-[scroll-locked=1]/body:h-svh',
              'pl-0' // padding-left forcé à 0
            )}
          >
            <Outlet />
          </div>
        </FeedQueryProvider>
      </SidebarProvider>
    </SearchProvider>
  )
}
