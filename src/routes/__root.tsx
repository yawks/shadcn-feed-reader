import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'

import { AuthContext } from '@/utils/auth'
import GeneralError from '@/features/errors/general-error'
import { NavigationProgress } from '@/components/navigation-progress'
import NotFoundError from '@/features/errors/not-found-error'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Toaster } from '@/components/ui/sonner'

type RouterContext = {
  queryClient: QueryClient,
  authentication: AuthContext,
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => {
    return (
      <>
        <NavigationProgress />
        <Outlet />
        <Toaster duration={50000} />
        {import.meta.env.MODE === 'development' && (
          <>
            <ReactQueryDevtools buttonPosition='bottom-left' />
            <TanStackRouterDevtools position='bottom-right' />
          </>
        )}
      </>
    )
  },
  notFoundComponent: NotFoundError,
  errorComponent: GeneralError,
})
