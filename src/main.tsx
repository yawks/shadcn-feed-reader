// Force reload when a new service worker is available (PWA auto-update)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(reg => {
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                window.location.reload();
              }
            };
          }
        };
      });
    });
  });
}

import './index.css'

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'

import { AxiosError } from 'axios'
import { Capacitor } from '@capacitor/core'
import { FontProvider } from './context/font-context'
import { FontSizeProvider } from './context/font-size-context'
import { ProxyAuthProvider } from './context/proxy-auth-provider'
import ReactDOM from 'react-dom/client'
import { StrictMode } from 'react'
import { ThemeProvider } from './context/theme-context'
import { handleServerError } from '@/utils/handle-server-error'
// Generated Routes
import { routeTree } from './routeTree.gen'
import { toast } from 'sonner'
import { useAuth } from './utils/auth'
import { useAuthStore } from '@/stores/authStore'

// Capacitor diagnostic log
/* eslint-disable no-console */
console.log('[DIAGNOSTIC] App starting...')
console.log('[DIAGNOSTIC] window.Capacitor:', (window as any)?.Capacitor)
console.log('[DIAGNOSTIC] window.Capacitor.Plugins:', (window as any)?.Capacitor?.Plugins)
console.log('[DIAGNOSTIC] RawHtml plugin:', (window as any)?.Capacitor?.Plugins?.RawHtml)
/* eslint-enable no-console */



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.log({ failureCount, error })

        if (failureCount >= 0 && import.meta.env.DEV) return false
        if (failureCount > 3 && import.meta.env.PROD) return false

        return !(
          error instanceof AxiosError &&
          [401, 403].includes(error.response?.status ?? 0)
        )
      },
      refetchOnWindowFocus: import.meta.env.PROD,
      staleTime: 10 * 1000, // 10s
    },
    mutations: {
      onError: (error) => {
        handleServerError(error)

        if (error instanceof AxiosError) {
          if (error.response?.status === 304) {
            toast.error('Content not modified!')
          }
        }
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof AxiosError) {
        if (error.response?.status === 401) {
          toast.error('Session expired!')
          useAuthStore.getState().auth.reset()
          const redirect = `${router.history.location.href}`
          router.navigate({ to: '/sign-in', search: { redirect } })
        }
        if (error.response?.status === 500) {
          toast.error('Internal Server Error!')
          router.navigate({ to: '/500' })
        }
        if (error.response?.status === 403) {
          router.navigate({ to: '/403' })
        }
      }
    },
  }),
})

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    queryClient,
    authentication: undefined!
  },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme='light' storageKey='vite-ui-theme'>
          <FontProvider>
            <FontSizeProvider>
              <ProxyAuthProvider>
                {(() => {
                  const authentication = useAuth();
                  return (
                    <>
                      <RouterProvider router={router} context={{ authentication }} />
                    </>
                  );
                })()}
              </ProxyAuthProvider>
            </FontSizeProvider>
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}

// Android hardware back button handling (Capacitor)
// Prefer the Capacitor App plugin and register the listener only on Android.
try {
  if (Capacitor.getPlatform && Capacitor.getPlatform() === 'android') {
    const AppPlugin = (Capacitor as any).Plugins?.App
    if (AppPlugin && typeof AppPlugin.addListener === 'function') {
      // Diagnostic: confirm listener registration on device
      // eslint-disable-next-line no-console
      console.log('[DIAGNOSTIC] Registering backButton listener (Android)')
      AppPlugin.addListener('backButton', () => {
        // eslint-disable-next-line no-console
        console.log('[DIAGNOSTIC] backButton event fired', {
          href: window.location.href,
          historyLength: window.history?.length,
        })
        try {
          // Prefer SPA/web history back first
          if (window.history && window.history.length > 1) {
            // eslint-disable-next-line no-console
            console.log('[DIAGNOSTIC] going back in web history')
            window.history.back()
            return
          }

          // No web history: exit the app
          if (typeof AppPlugin.exitApp === 'function') {
            AppPlugin.exitApp()
            return
          }

          // Final fallback
          if ((navigator as any).app && typeof (navigator as any).app.exitApp === 'function') {
            ;(navigator as any).app.exitApp()
            return
          }

          window.close()
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('backButton handler error', err)
        }
      })
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('failed to register Capacitor backButton listener', e)
}
