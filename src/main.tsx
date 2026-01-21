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
import './i18n'

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

// Fix for safe area restoration after exiting fullscreen video
// On Android WebView, safe-area-inset-* becomes 0 after fullscreen exit
// We capture values from Capacitor events and reapply them manually
const setupFullscreenSafeAreaFix = () => {
  // Store safe area values from Capacitor (env() CSS doesn't work reliably on Android)
  let capacitorSafeAreas: { top: number; bottom: number } = { top: 0, bottom: 0 }
  let fullscreenExitTime = 0 // Timestamp when fullscreen was exited
  let lastAppliedTime = 0 // Timestamp when safe areas were last applied (debounce)

  // Debug: log current state of #content element and CSS env() values
  const logContentState = (context: string) => {
    const content = document.getElementById('content')

    // Try to read env() values via a temporary element
    const testEl = document.createElement('div')
    testEl.style.cssText = 'position:absolute;visibility:hidden;height:env(safe-area-inset-top,0px);'
    document.body.appendChild(testEl)
    const envTop = testEl.offsetHeight
    testEl.style.height = 'env(safe-area-inset-bottom,0px)'
    const envBottom = testEl.offsetHeight
    testEl.remove()

    // eslint-disable-next-line no-console
    console.log(`[SAFE-AREA-DEBUG] ${context}`, {
      envTop,
      envBottom,
      capacitorSafeAreas,
      contentExists: !!content,
      contentInlineHeight: content?.style.height || '(none)',
      contentInlinePaddingTop: content?.style.paddingTop || '(none)',
      contentComputedHeight: content ? getComputedStyle(content).height : '(N/A)',
      contentComputedPaddingTop: content ? getComputedStyle(content).paddingTop : '(N/A)',
      windowInnerHeight: window.innerHeight,
      documentHeight: document.documentElement.clientHeight,
      visualViewportHeight: window.visualViewport?.height,
      fullscreenElement: document.fullscreenElement ? 'yes' : 'no',
    })
  }

  // Apply safe areas manually via inline styles
  const applySafeAreas = (context: string) => {
    const content = document.getElementById('content')
    if (!content) return

    const topInset = capacitorSafeAreas.top
    const bottomInset = capacitorSafeAreas.bottom

    // Match the formula from route.tsx:
    // height = 100svh - top - (bottom/2), paddingTop = top
    // With box-sizing: border-box, the padding is inside the height,
    // so content area = height - paddingTop = 100svh - 2*top - bottom/2
    // This is the same as CSS env() behavior
    const height = `calc(100svh - ${topInset}px - ${bottomInset / 2}px)`
    const paddingTop = `${topInset}px`

    // Check if already applied with same values (avoid redundant updates)
    if (content.style.height === height && content.style.paddingTop === paddingTop) {
      // eslint-disable-next-line no-console
      console.log(`[FULLSCREEN] Skipping applySafeAreas (${context}) - already applied with same values`)
      return
    }

    // Debounce: don't reapply if we just applied within the last 500ms
    const now = Date.now()
    if (now - lastAppliedTime < 500) {
      // eslint-disable-next-line no-console
      console.log(`[FULLSCREEN] Skipping applySafeAreas (${context}) - debounced, last applied ${now - lastAppliedTime}ms ago`)
      return
    }
    lastAppliedTime = now

    // eslint-disable-next-line no-console
    console.log(`[FULLSCREEN] Applying safe areas (${context}) top=${topInset} bottom=${bottomInset} height=${height}`)

    content.style.height = height
    content.style.paddingTop = paddingTop

    // Force reflow
    void content.offsetHeight

    logContentState(`after-applySafeAreas(${context})`)
  }

  // Restore original CSS env() styles (these are the same as in route.tsx)
  const restoreEnvStyles = (context: string) => {
    const content = document.getElementById('content')
    if (!content) return

    // eslint-disable-next-line no-console
    console.log(`[FULLSCREEN] Restoring env() styles (${context})`)

    // Restore the original inline styles from route.tsx that use env()
    content.style.height = 'calc(100svh - env(safe-area-inset-top, 0px) - calc(env(safe-area-inset-bottom, 0px) / 2))'
    content.style.paddingTop = 'env(safe-area-inset-top, 0px)'

    logContentState(`after-restoreEnvStyles(${context})`)
  }

  // Check if we recently exited fullscreen (within the last 3 seconds)
  const hasRecentlyExitedFullscreen = () => {
    return fullscreenExitTime > 0 && (Date.now() - fullscreenExitTime) < 3000
  }

  const handleFullscreenChange = () => {
    const isEnteringFullscreen = !!document.fullscreenElement

    // eslint-disable-next-line no-console
    console.log('[FULLSCREEN] fullscreenchange event', {
      isEnteringFullscreen,
      capacitorSafeAreas,
    })

    if (isEnteringFullscreen) {
      // Entering fullscreen - reset exit time
      fullscreenExitTime = 0
    } else {
      // Exiting fullscreen
      fullscreenExitTime = Date.now()
      // eslint-disable-next-line no-console
      console.log('[FULLSCREEN] Exited fullscreen, will check env() and restore safe areas if needed')

      // Helper to check env() and apply styles only if needed
      const checkAndApplySafeAreas = (context: string) => {
        // Check if CSS env() is working
        const testEl = document.createElement('div')
        testEl.style.cssText = 'position:absolute;visibility:hidden;height:env(safe-area-inset-top,0px);'
        document.body.appendChild(testEl)
        const envTop = testEl.offsetHeight
        testEl.style.height = 'env(safe-area-inset-bottom,0px)'
        const envBottom = testEl.offsetHeight
        testEl.remove()

        // eslint-disable-next-line no-console
        console.log(`[FULLSCREEN] ${context} - env() check: envTop=${envTop} envBottom=${envBottom} capacitorTop=${capacitorSafeAreas.top} capacitorBottom=${capacitorSafeAreas.bottom}`)

        if (envTop === 0 && envBottom === 0 && (capacitorSafeAreas.top > 0 || capacitorSafeAreas.bottom > 0)) {
          // env() is broken, apply inline styles with Capacitor values
          applySafeAreas(context)
        } else {
          // env() is working, restore env() styles
          restoreEnvStyles(context)
        }
      }

      // Check at multiple intervals as env() might take time to recover
      setTimeout(() => checkAndApplySafeAreas('fullscreen-50ms'), 50)
      setTimeout(() => checkAndApplySafeAreas('fullscreen-300ms'), 300)
      setTimeout(() => checkAndApplySafeAreas('fullscreen-1000ms'), 1000)

      // Dispatch resize event to notify all listeners
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'))
      }, 100)
    }
  }

  // Listen to Capacitor window insets events to capture real safe area values
  const handleCapacitorInsets = (ev: Event) => {
    try {
      const ce = ev as CustomEvent & { detail?: { top?: number; bottom?: number } }
      const rawTop = Number(ce?.detail?.top) || 0
      const rawBottom = Number(ce?.detail?.bottom) || 0

      // Capacitor returns physical pixels, but CSS uses logical (CSS) pixels
      // Divide by devicePixelRatio to convert
      const dpr = window.devicePixelRatio || 1
      const top = Math.round(rawTop / dpr)
      const bottom = Math.round(rawBottom / dpr)

      // eslint-disable-next-line no-console
      console.log(`[FULLSCREEN] Received Capacitor insets raw=(${rawTop},${rawBottom}) dpr=${dpr} css=(${top},${bottom}) recentFullscreen=${hasRecentlyExitedFullscreen()}`)
      logContentState('capacitor-insets-received')

      // Store the values (even if they seem large, modern Android can have 100-200px insets)
      if (top > 0 || bottom > 0) {
        capacitorSafeAreas = { top, bottom }

        // Check if CSS env() is working by reading current values
        const testEl = document.createElement('div')
        testEl.style.cssText = 'position:absolute;visibility:hidden;height:env(safe-area-inset-top,0px);'
        document.body.appendChild(testEl)
        const envTop = testEl.offsetHeight
        testEl.style.height = 'env(safe-area-inset-bottom,0px)'
        const envBottom = testEl.offsetHeight
        testEl.remove()

        // eslint-disable-next-line no-console
        console.log(`[FULLSCREEN] Comparing Capacitor vs env(): capacitorTop=${top} capacitorBottom=${bottom} envTop=${envTop} envBottom=${envBottom}`)

        // Only apply inline styles if env() is broken (returns 0 when it shouldn't)
        if (envTop === 0 && envBottom === 0) {
          // env() is broken, apply inline styles
          applySafeAreas('capacitor-event-env-broken')
        } else {
          // env() is working, clear any stale inline styles
          restoreEnvStyles('capacitor-event-env-working')
        }
      } else if (top === 0 && bottom === 0) {
        // Insets are 0 - this might be intentional (e.g., fullscreen)
        // or it might be a bug. Clear inline styles to avoid stale values.
        restoreEnvStyles('capacitor-event-zero-insets')
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[FULLSCREEN] Error handling Capacitor insets', e)
    }
  }

  // Listen to all fullscreen change events
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

  // Listen to Capacitor window insets
  window.addEventListener('capacitor-window-insets', handleCapacitorInsets as EventListener)

  // Also listen to visibility change - always clear inline styles on resume
  // to ensure CSS env() handles safe areas (fixes double margin on app resume)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // eslint-disable-next-line no-console
      console.log('[VISIBILITY] App became visible, recentFullscreen:', hasRecentlyExitedFullscreen())
      logContentState('visibility-change-visible')

      // If we recently exited fullscreen and are now visible, apply safe areas briefly
      if (hasRecentlyExitedFullscreen() && (capacitorSafeAreas.top > 0 || capacitorSafeAreas.bottom > 0)) {
        setTimeout(() => applySafeAreas('visibility-after-fullscreen'), 100)
      }
      // Note: onResume in MainActivity will trigger requestApplyInsets() which will
      // dispatch capacitor-window-insets event, and that handler will clear inline styles
    }
  })

  // eslint-disable-next-line no-console
  console.log('[FULLSCREEN] Safe area fix initialized, waiting for Capacitor events')

  // Log initial state after a short delay (wait for DOM to be ready)
  setTimeout(() => logContentState('initial-after-1s'), 1000)
  setTimeout(() => logContentState('initial-after-3s'), 3000)
}

setupFullscreenSafeAreaFix()



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
            ; (navigator as any).app.exitApp()
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
