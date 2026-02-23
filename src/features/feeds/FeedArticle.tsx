import { memo, useEffect, useRef, useState } from 'react'
import { FeedItem } from '@/backends/types'
import {
  getArticleViewMode,
  getArticleViewModeSync,
  setArticleViewMode,
} from '@/lib/article-view-storage'
import { storeAuth } from '@/lib/auth-storage'
import { safeInvoke } from '@/lib/safe-invoke'
import {
  hasSelectorConfig,
  hasSelectorConfigSync,
} from '@/lib/selector-config-storage'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/context/font-size-context'
import { useTheme } from '@/context/theme-context'
import { useOrientation } from '@/hooks/use-orientation'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthDialog } from '@/components/auth-dialog'
import { ImageContextMenu } from '@/components/image-context-menu'
import { ArticleToolbar, ArticleViewMode } from './ArticleToolbar'
import { FloatingActionButton } from './FloatingActionButton'
import { prepareHtmlForShadowDom } from './article-html-preparation'
import {
  handleOriginalView,
  handleReadabilityView,
  handleConfiguredView,
} from './article-view-handlers'
import { getShadowDomZoomScript } from './article-zoom-scripts'

type FeedArticleProps = {
  item: FeedItem
  isMobile?: boolean
  onBack?: () => void
}

function FeedArticleComponent({
  item,
  isMobile = false,
  onBack,
}: FeedArticleProps) {
  const { theme } = useTheme()
  const { fontSize } = useFontSize()
  const isLandscape = useOrientation()

  const [isLoading, setIsLoading] = useState(true)
  const [, setArticleContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [injectedHtml, setInjectedHtml] = useState<string | null>(null) // For direct HTML injection (original mode)
  const [injectedScripts, setInjectedScripts] = useState<string[]>([]) // Inline scripts to execute separately
  const [injectedExternalScripts, setInjectedExternalScripts] = useState<
    string[]
  >([]) // External scripts (with src) to load
  const [injectedExternalStylesheets, setInjectedExternalStylesheets] =
    useState<string[]>([]) // External stylesheets to load

  // Initialize viewMode from storage (per feed), default to "readability"
  // Use a state to track if viewMode is loaded (to avoid loading article before mode is known)
  const [viewMode, setViewMode] = useState<ArticleViewMode>(() => {
    // Try to load synchronously from storage on initial render
    // For Capacitor, this will return 'readability' and we'll load async in useEffect
    const feedId = item.feed?.id || 'default'
    return getArticleViewModeSync(feedId)
  })
  // Track which feedId the current viewMode corresponds to
  // This prevents race conditions when switching between feeds with different viewModes
  const [viewModeFeedId, setViewModeFeedId] = useState<string>(
    () => item.feed?.id || 'default'
  )
  const [viewModeLoaded, setViewModeLoaded] = useState(true)

  const [proxyPort, setProxyPort] = useState<number | null>(null)
  const [authDialog, setAuthDialog] = useState<{ domain: string } | null>(null)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [youtubeVideo, setYoutubeVideo] = useState<{
    videoId: string
    title: string
  } | null>(null)

  // Selector configuration state
  const [selectorConfigExists, setSelectorConfigExists] = useState<boolean>(
    () => {
      const feedId = item.feed?.id || 'default'
      return hasSelectorConfigSync(feedId)
    }
  )

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const injectedHtmlRef = useRef<HTMLDivElement>(null) // For direct HTML injection

  // Internal navigation state: allows same-domain link navigation within the article view
  const [internalNavUrl, setInternalNavUrl] = useState<string | null>(null)
  const internalNavHistory = useRef<string[]>([])
  // Effective URL: use internal nav URL if navigated, otherwise item.url
  const effectiveUrl = internalNavUrl || item.url || ''
  // Ref to track current effective URL for use in event handlers (avoids stale closures)
  const effectiveUrlRef = useRef(effectiveUrl)
  effectiveUrlRef.current = effectiveUrl

  // Reset internal navigation when the article changes
  useEffect(() => {
    setInternalNavUrl(null)
    internalNavHistory.current = []
    autoRetryCountRef.current = 0
  }, [item.url])

  // Auto-retry configured view on error (up to 2 times, without user interaction)
  useEffect(() => {
    if (!error || viewMode !== 'configured') return
    if (autoRetryCountRef.current >= 2) return

    autoRetryCountRef.current++
    const currentMode = viewMode
    const timer = setTimeout(() => {
      setError(null)
      setIsLoading(true)
      setViewMode((v) => (v === 'readability' ? 'original' : 'readability'))
      setTimeout(() => setViewMode(currentMode), 50)
    }, 300)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  // Now all view modes use iframe for isolated scroll context
  const isIframeView = true

  // Load view mode from storage when feed or article changes (for Capacitor)
  // This MUST complete before the article loading useEffect runs
  useEffect(() => {
    const feedId = item.feed?.id || 'default'

    // eslint-disable-next-line no-console
    console.log(
      `[FeedArticle] Loading view mode for feed ${feedId}, article ${item.url}, current mode: ${viewMode}, currentFeedId: ${viewModeFeedId}`
    )

    // IMPORTANT: Mark viewMode as not ready for THIS feed yet
    // This prevents race conditions when switching feeds
    if (feedId !== viewModeFeedId) {
      // eslint-disable-next-line no-console
      console.log(
        `[FeedArticle] Feed changed from ${viewModeFeedId} to ${feedId}, marking viewMode as not loaded`
      )
      setViewModeLoaded(false)
    }

    // Load saved mode asynchronously
    getArticleViewMode(feedId)
      .then((savedMode) => {
        // eslint-disable-next-line no-console
        console.log(
          `[FeedArticle] Loaded saved mode: ${savedMode}, current: ${viewMode}`
        )
        // Update mode if different
        if (savedMode !== viewMode) {
          // eslint-disable-next-line no-console
          console.log(
            `[FeedArticle] Setting viewMode to ${savedMode} (was ${viewMode})`
          )
          setViewMode(savedMode)
        }
        // Update the feedId for which the viewMode is valid
        setViewModeFeedId(feedId)
        // Mark as loaded - this will allow the article loading useEffect to run
        setViewModeLoaded(true)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[FeedArticle] Failed to load view mode:', err)
        // On error, use current mode and mark as loaded
        setViewModeFeedId(feedId)
        setViewModeLoaded(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.feed?.id, item.url]) // Don't include viewMode/viewModeFeedId to avoid loop - we only want to load when feed/article changes

  // Check if selector config exists when feed changes
  useEffect(() => {
    const feedId = item.feed?.id || 'default'
    hasSelectorConfig(feedId).then(setSelectorConfigExists)
  }, [item.feed?.id])

  useEffect(() => {
    // Start the proxy (Tauri or Capacitor) if available; ignore errors in browser dev
    const startProxy = async () => {
      // eslint-disable-next-line no-console
      console.log('[FeedArticle] Starting proxy initialization...')
      // Try Tauri first (desktop)
      try {
        const port = await safeInvoke('start_proxy')
        setProxyPort(Number(port))
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] ✓ Tauri proxy started on port:', port)
        return
      } catch (tauriErr) {
        // eslint-disable-next-line no-console
        console.debug(
          '[FeedArticle] Tauri proxy not available or failed (dev):',
          tauriErr
        )
      }
    }

    startProxy()
  }, [])

  // Use ref to track the last loaded URL to prevent unnecessary reloads
  const lastLoadedUrlRef = useRef<string | null>(null)
  const lastViewModeRef = useRef<ArticleViewMode | null>(null)
  const lastThemeRef = useRef<string | null>(null)
  const lastFontSizeRef = useRef<string | null>(null)
  const lastProxyPortRef = useRef<number | null>(null)
  // Monotonic counter to detect stale async loads (race condition prevention)
  const articleLoadIdRef = useRef(0)
  // Auto-retry counter for configured view (resets on article change)
  const autoRetryCountRef = useRef(0)

  useEffect(() => {
    // CRITICAL: Don't load article until viewMode is loaded (on Capacitor)
    // This prevents double loading (readability -> original)
    if (!viewModeLoaded) {
      // eslint-disable-next-line no-console
      console.log(
        '⏳ [FeedArticle] Waiting for viewMode to load before loading article...'
      )
      return
    }

    // CRITICAL: Don't load article if viewMode is for a different feed
    // This prevents using stale viewMode from previous feed (race condition fix)
    const currentFeedId = item.feed?.id || 'default'
    if (viewModeFeedId !== currentFeedId) {
      // eslint-disable-next-line no-console
      console.log(
        `⏳ [FeedArticle] viewMode is for feed ${viewModeFeedId}, waiting for feed ${currentFeedId}...`
      )
      return
    }

    // Skip reload if URL, viewMode, theme, fontSize, and proxyPort haven't changed
    // Only reload if URL or viewMode changes (not theme/fontSize for readability mode)
    const urlChanged = lastLoadedUrlRef.current !== effectiveUrl
    const viewModeChanged = lastViewModeRef.current !== viewMode
    const themeChanged = lastThemeRef.current !== theme
    const fontSizeChanged = lastFontSizeRef.current !== fontSize
    // Reload if proxy just became available (was null, now has a port) - fixes race condition
    // where article was loaded before proxy was ready, causing fetchRawHtml to fail
    const proxyBecameAvailable =
      lastProxyPortRef.current === null && proxyPort !== null

    // eslint-disable-next-line no-console
    console.log('🟡 [FeedArticle] useEffect triggered', {
      urlChanged,
      viewModeChanged,
      themeChanged,
      fontSizeChanged,
      proxyBecameAvailable,
      currentUrl: effectiveUrl,
      lastUrl: lastLoadedUrlRef.current,
      currentViewMode: viewMode,
      lastViewMode: lastViewModeRef.current,
      isMobile,
      isLandscape,
      viewModeLoaded,
    })
    // Log séparé pour faciliter le grep
    // eslint-disable-next-line no-console
    console.log(
      '[FeedArticle] urlChanged=' +
        urlChanged +
        ' viewModeChanged=' +
        viewModeChanged +
        ' viewModeLoaded=' +
        viewModeLoaded +
        ' proxyBecameAvailable=' +
        proxyBecameAvailable
    )

    // For readability mode, theme and fontSize changes should update the blob without full reload
    // For other modes, only reload if URL or viewMode changes
    if (!urlChanged && !viewModeChanged && !proxyBecameAvailable) {
      // If only theme/fontSize changed and we're in readability mode, update the iframe content
      if (viewMode === 'readability' && (themeChanged || fontSizeChanged)) {
        // Update refs
        lastThemeRef.current = theme
        lastFontSizeRef.current = fontSize
        // eslint-disable-next-line no-console
        console.log(
          '🟠 [FeedArticle] Only theme/fontSize changed, updating blob'
        )
        // Recreate the blob with new theme/fontSize (this will be handled by the effect below)
        // But we need to trigger it, so we'll let it continue
      } else {
        // No changes needed
        // eslint-disable-next-line no-console
        console.log('✅ [FeedArticle] No changes needed, skipping reload')
        return
      }
    }

    // Update refs
    lastLoadedUrlRef.current = effectiveUrl || null
    lastViewModeRef.current = viewMode
    lastThemeRef.current = theme
    lastFontSizeRef.current = fontSize
    lastProxyPortRef.current = proxyPort

    // eslint-disable-next-line no-console
    console.log('🔴 [FeedArticle] Reloading article', {
      url: effectiveUrl,
      viewMode,
      viewModeLoaded,
    })
    // eslint-disable-next-line no-console
    console.log(
      '[FeedArticle] RELOADING url=' + effectiveUrl + ' viewMode=' + viewMode
    )

    const setIframeUrl = (url: string) => {
      if (iframeRef.current) iframeRef.current.src = url
    }

    // eslint-disable-next-line no-console
    console.log('[FeedArticle] About to load article, proxyPort:', proxyPort)

    // Stale-load prevention: each load gets a unique ID.
    // Handlers check isStale() at async boundaries and abort if a newer load started.
    const loadId = ++articleLoadIdRef.current
    const isStale = () => articleLoadIdRef.current !== loadId

    // Reset loading state for every new load (mode switch, URL change, auth reload, etc.)
    setIsLoading(true)
    setError(null)

    if (viewMode === 'readability') {
      handleReadabilityView({
        url: effectiveUrl,
        proxyPort,
        theme,
        fontSize,
        setArticleContent,
        setError,
        setIsLoading,
        setAuthDialog,
        setIframeUrl,
        isStale,
      })
    } else if (viewMode === 'original') {
      // eslint-disable-next-line no-console
      console.log(
        '[FeedArticle] Calling handleOriginalView with proxyPort:',
        proxyPort
      )
      handleOriginalView({
        url: effectiveUrl,
        proxyPort,
        setInjectedHtml,
        setInjectedScripts,
        setInjectedExternalScripts,
        setInjectedExternalStylesheets,
        setError,
        setIsLoading,
        prepareHtmlForShadowDom,
      })
    } else if (viewMode === 'configured') {
      const feedId = item.feed?.id || 'default'
      // eslint-disable-next-line no-console
      console.log(
        '[FeedArticle] Calling handleConfiguredView with proxyPort:',
        proxyPort,
        'feedId:',
        feedId
      )
      handleConfiguredView({
        url: effectiveUrl,
        proxyPort,
        feedId,
        theme,
        fontSize,
        setArticleContent,
        setError,
        setIsLoading,
        setAuthDialog,
        setIframeUrl,
        isStale,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveUrl,
    viewMode,
    proxyPort,
    theme,
    fontSize,
    viewModeLoaded,
    viewModeFeedId,
    item.feed?.id,
  ]) // isMobile and isLandscape are intentionally excluded - they shouldn't trigger reload

  useEffect(() => {
    const iframe = iframeRef.current
    if (!isIframeView || !iframe) {
      return
    }

    const handleLoad = () => {
      // Ignore load events for about:blank (initial iframe state before real content is set)
      if (!iframe.src || iframe.src === 'about:blank') return

      setIsLoading(false)

      if (iframe.contentWindow) {
        // Check iframe document for diagnostics (same-origin only, for blob URLs in readability mode)
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document
          if (doc) {
            const h =
              doc.documentElement?.scrollHeight || doc.body?.scrollHeight
            // eslint-disable-next-line no-console
            console.debug(
              '[DIAG] FeedArticle: iframe document scrollHeight (same-origin):',
              h
            )

            // Check viewport meta for zoom support
            const viewportMeta = doc.querySelector('meta[name="viewport"]')
            if (viewportMeta) {
              // eslint-disable-next-line no-console
              console.debug(
                '[DIAG] FeedArticle: iframe viewport meta:',
                viewportMeta.getAttribute('content')
              )
            } else {
              // eslint-disable-next-line no-console
              console.warn(
                '[DIAG] FeedArticle: iframe viewport meta NOT FOUND - zoom may not work!'
              )
            }

            // Log touch-action styles
            const htmlEl = doc.documentElement
            const bodyEl = doc.body
            if (htmlEl) {
              const htmlStyle = window.getComputedStyle(htmlEl)
              // eslint-disable-next-line no-console
              console.debug(
                '[DIAG] FeedArticle: iframe html touch-action:',
                htmlStyle.touchAction
              )
            }
            if (bodyEl) {
              const bodyStyle = window.getComputedStyle(bodyEl)
              // eslint-disable-next-line no-console
              console.debug(
                '[DIAG] FeedArticle: iframe body touch-action:',
                bodyStyle.touchAction
              )
            }
          }
        } catch (_e) {
          // eslint-disable-next-line no-console
          console.debug(
            '[DIAG] FeedArticle: iframe same-origin access denied (cross-origin)'
          )
        }
      }
    }

    iframe.addEventListener('load', handleLoad)
    return () => {
      iframe.removeEventListener('load', handleLoad)
    }
  }, [isIframeView, viewMode, theme, proxyPort, item.url])

  // Listen for auth requests from proxy via postMessage
  // Also listen for image long press events from iframe
  // Also listen for YouTube video clicks from iframe
  // Also listen for internal/external link navigation from iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'PROXY_AUTH_REQUIRED' && event.data?.domain) {
        const { domain } = event.data
        setAuthDialog({ domain })
      } else if (
        event.data?.type === 'IMAGE_LONG_PRESS' &&
        event.data?.imageUrl
      ) {
        setSelectedImageUrl(event.data.imageUrl)
      } else if (
        event.data?.type === 'YOUTUBE_VIDEO_CLICK' &&
        event.data?.videoId
      ) {
        // Open YouTube video in modal
        setYoutubeVideo({
          videoId: event.data.videoId,
          title: event.data.videoTitle || '',
        })
      } else if (
        event.data?.type === 'NAVIGATE_INTERNAL' &&
        event.data?.url
      ) {
        // Same-domain link: navigate within the article view using the same view mode
        const currentUrl = effectiveUrlRef.current
        if (currentUrl) {
          internalNavHistory.current.push(currentUrl)
        }
        setInternalNavUrl(event.data.url)
        setIsLoading(true)
      } else if (
        event.data?.type === 'OPEN_EXTERNAL' &&
        event.data?.url
      ) {
        // Cross-domain link: open in system browser or new tab
        const externalUrl = event.data.url
        try {
          const shellMod = await import('@tauri-apps/plugin-shell')
          if (typeof shellMod.open === 'function') {
            await shellMod.open(externalUrl)
          } else {
            window.open(externalUrl, '_blank', 'noopener,noreferrer')
          }
        } catch (_e) {
          window.open(externalUrl, '_blank', 'noopener,noreferrer')
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Handle auth dialog submission
  const handleAuthSubmit = async (username: string, password: string) => {
    if (!authDialog) return

    const { domain } = authDialog

    // Store credentials in localStorage
    storeAuth(domain, username, password)

    // Set auth for Tauri (desktop)
    try {
      await safeInvoke('set_proxy_auth', { domain, username, password })
    } catch (_e) {
      // Ignore
    }

    setAuthDialog(null)

    // Reload the current view to retry with auth
    if (viewMode === 'readability') {
      // Trigger a re-render by changing view mode temporarily
      // This will cause the useEffect to re-run and retry fetchRawHtml with auth
      setViewMode('original')
      setTimeout(() => setViewMode('readability'), 10)
    } else if (viewMode === 'configured') {
      // Same approach for configured mode
      setViewMode('original')
      setTimeout(() => setViewMode('configured'), 10)
    } else if (viewMode === 'original') {
      // Force reload iframe
      if (iframeRef.current) {
        const currentSrc = iframeRef.current.src
        iframeRef.current.src = 'about:blank'
        setTimeout(() => {
          if (iframeRef.current) iframeRef.current.src = currentSrc
        }, 100)
      }
    }
  }

  const handleAuthCancel = () => {
    setAuthDialog(null)
  }

  // Inject HTML into Shadow DOM when injectedHtml changes (for original mode)
  useEffect(() => {
    if (injectedHtml && injectedHtmlRef.current) {
      // Clear any existing shadow root
      if (injectedHtmlRef.current.shadowRoot) {
        injectedHtmlRef.current.shadowRoot.innerHTML = ''
      } else {
        // Create shadow root with open mode (allows JS to access it)
        injectedHtmlRef.current.attachShadow({ mode: 'open' })
      }

      const shadowRoot = injectedHtmlRef.current.shadowRoot
      if (!shadowRoot) return

      const hostElement = shadowRoot.host as HTMLElement
      // Ensure the host element has proper positioning context for fixed elements inside Shadow DOM
      hostElement.style.position = 'relative'
      hostElement.style.isolation = 'isolate' // Create a new stacking context

      // Load external stylesheets first (they need to be loaded before content renders)
      // Load them IN the Shadow DOM to maintain style isolation
      const loadExternalStylesheets = async () => {
        const stylesheetPromises = injectedExternalStylesheets.map((href) => {
          return new Promise<void>((resolve) => {
            // Check if stylesheet is already loaded in shadow root
            const existingLink = shadowRoot.querySelector(
              `link[href="${href}"]`
            )
            if (existingLink) {
              resolve()
              return
            }

            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = href
            link.onload = () => {
              resolve()
            }
            link.onerror = () => {
              // eslint-disable-next-line no-console
              console.warn(
                '[FeedArticle] Failed to load external stylesheet:',
                href
              )
              resolve() // Continue even if stylesheet fails to load
            }
            // Append to shadow root, not document.head, to maintain isolation
            shadowRoot.appendChild(link)
          })
        })

        await Promise.all(stylesheetPromises)
      }

      // Store original document methods for restoration (before any modifications)
      const originalGetElementById = document.getElementById.bind(document)
      const originalQuerySelector = document.querySelector.bind(document)
      const originalQuerySelectorAll = document.querySelectorAll.bind(document)
      const originalGetElementsByClassName =
        document.getElementsByClassName.bind(document)
      const originalGetElementsByTagName =
        document.getElementsByTagName.bind(document)

      // Load external scripts (they need to be loaded before inline scripts can use them)
      const loadExternalScripts = async () => {
        const scriptPromises = injectedExternalScripts.map((scriptSrc) => {
          return new Promise<void>((resolve) => {
            // Check if script is already loaded
            const existingScript = document.querySelector(
              `script[src="${scriptSrc}"]`
            )
            if (existingScript) {
              resolve()
              return
            }

            const script = document.createElement('script')
            script.src = scriptSrc
            script.async = true
            script.onload = () => {
              // eslint-disable-next-line no-console
              console.log('[FeedArticle] External script loaded:', scriptSrc)
              resolve()
            }
            script.onerror = () => {
              // eslint-disable-next-line no-console
              console.warn(
                '[FeedArticle] Failed to load external script:',
                scriptSrc
              )
              resolve() // Continue even if script fails to load
            }
            document.head.appendChild(script)
          })
        })

        await Promise.all(scriptPromises)
      }

      // Permanently redirect document methods to search in shadow root first
      // This is needed because scripts may use async callbacks (like DOMContentLoaded)
      document.getElementById = function (id: string) {
        // ShadowRoot doesn't have getElementById, use querySelector instead
        // Use CSS.escape to handle IDs starting with digits (e.g., '85' -> '#\35 85')
        const shadowElement = shadowRoot.querySelector('#' + CSS.escape(id))
        if (shadowElement) {
          // eslint-disable-next-line no-console
          console.log('[FeedArticle] Found element in shadow DOM:', id)
          return shadowElement as HTMLElement | null
        }
        return originalGetElementById.call(document, id)
      }
      document.querySelector = function (selector: string) {
        try {
          const shadowElement = shadowRoot.querySelector(selector)
          return shadowElement || originalQuerySelector.call(document, selector)
        } catch (e) {
          // Invalid selector (e.g., '#85' - IDs starting with digits are invalid CSS selectors)
          // Try to escape the ID if it looks like an ID selector
          if (selector.startsWith('#') && !selector.includes(' ')) {
            const id = selector.slice(1)
            const escapedSelector = '#' + CSS.escape(id)
            const shadowElement = shadowRoot.querySelector(escapedSelector)
            return (
              shadowElement ||
              originalQuerySelector.call(document, escapedSelector)
            )
          }
          // Re-throw if we can't handle it
          throw e
        }
      }
      document.querySelectorAll = function (selector: string) {
        try {
          const shadowResults = shadowRoot.querySelectorAll(selector)
          return shadowResults.length > 0
            ? shadowResults
            : originalQuerySelectorAll.call(document, selector)
        } catch (e) {
          // Invalid selector (e.g., '#85' - IDs starting with digits are invalid CSS selectors)
          // Try to escape the ID if it looks like an ID selector
          if (selector.startsWith('#') && !selector.includes(' ')) {
            const id = selector.slice(1)
            const escapedSelector = '#' + CSS.escape(id)
            const shadowResults = shadowRoot.querySelectorAll(escapedSelector)
            return shadowResults.length > 0
              ? shadowResults
              : originalQuerySelectorAll.call(document, escapedSelector)
          }
          // Re-throw if we can't handle it
          throw e
        }
      }
      document.getElementsByClassName = function (className: string) {
        const shadowResults = shadowRoot.querySelectorAll('.' + className)
        return shadowResults.length > 0
          ? (shadowResults as unknown as HTMLCollectionOf<Element>)
          : originalGetElementsByClassName.call(document, className)
      }
      document.getElementsByTagName = function (tagName: string) {
        const shadowResults = shadowRoot.querySelectorAll(tagName)
        return shadowResults.length > 0
          ? (shadowResults as unknown as HTMLCollectionOf<Element>)
          : originalGetElementsByTagName.call(document, tagName)
      }

      // Load stylesheets first, then inject HTML, then load scripts
      // Use .then() since useEffect callback cannot be async
      loadExternalStylesheets().then(() => {
        // Inject HTML into shadow root (without scripts - they're executed separately)
        // Security: This is intentional - we're injecting proxied HTML content from trusted sources
        shadowRoot.innerHTML = injectedHtml
        // Content is now in the Shadow DOM — hide the loader
        setIsLoading(false)

        // Add zoom implementation script to shadow DOM
        const zoomScript = shadowRoot.ownerDocument.createElement('script')
        zoomScript.textContent = getShadowDomZoomScript()
        shadowRoot.appendChild(zoomScript)

        // Function to convert position:fixed to position:absolute for all elements
        // This ensures fixed elements stay contained within the Shadow DOM
        const convertFixedToAbsolute = () => {
          const allElements = shadowRoot.querySelectorAll('*')
          allElements.forEach((element) => {
            const el = element as HTMLElement
            // Check computed style (this catches both inline styles and CSS classes)
            const computedStyle = window.getComputedStyle(el)
            if (computedStyle.position === 'fixed') {
              // Preserve the original top, left, right, bottom values
              const top = computedStyle.top
              const left = computedStyle.left
              const right = computedStyle.right
              const bottom = computedStyle.bottom

              // Convert to absolute
              el.style.position = 'absolute'
              if (top && top !== 'auto') el.style.top = top
              if (left && left !== 'auto') el.style.left = left
              if (right && right !== 'auto') el.style.right = right
              if (bottom && bottom !== 'auto') el.style.bottom = bottom
            }
          })
        }

        // Convert fixed to absolute immediately after HTML injection
        convertFixedToAbsolute()

        // Also use a MutationObserver to catch dynamically added elements with position:fixed
        const observer = new MutationObserver(() => {
          convertFixedToAbsolute()
        })
        observer.observe(shadowRoot, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class'],
        })

        // Store observer reference for cleanup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(shadowRoot as any)._positionObserver = observer

        // Continue with script loading after HTML is injected
        loadExternalScripts().then(() => {
          // Wait a bit to ensure DOM is fully parsed
          setTimeout(() => {
            // Verify elements are in shadow DOM before executing scripts
            const testElement =
              shadowRoot.querySelector('#tweet_1986189869287170303') ||
              shadowRoot.querySelector('[id^="tweet_"]') ||
              shadowRoot.querySelector('div[id]')
            // eslint-disable-next-line no-console
            console.log(
              '[FeedArticle] Shadow DOM test element:',
              testElement ? 'found' : 'not found'
            )
            // eslint-disable-next-line no-console
            console.log(
              '[FeedArticle] Shadow DOM HTML length:',
              shadowRoot.innerHTML.length
            )

            // Execute inline scripts (document methods are already redirected)
            injectedScripts.forEach((scriptContent, index) => {
              try {
                // eslint-disable-next-line no-console
                console.log(
                  '[FeedArticle] Executing script',
                  index + 1,
                  'of',
                  injectedScripts.length
                )
                // Execute script directly - document methods are already redirected
                const scriptFunction = new Function(
                  'document',
                  'window',
                  scriptContent
                )
                scriptFunction(document, window)
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error(
                  '[FeedArticle] Error executing script in Shadow DOM:',
                  err
                )
              }
            })

            // Trigger DOMContentLoaded event AFTER scripts are executed
            // This ensures that async callbacks can use the redirected document methods
            const domContentLoadedEvent = new Event('DOMContentLoaded', {
              bubbles: true,
              cancelable: true,
            })
            window.dispatchEvent(domContentLoadedEvent)
            document.dispatchEvent(domContentLoadedEvent)

            // Log videos found in Shadow DOM after scripts have executed
            const videos = shadowRoot.querySelectorAll('video')
            if (videos && videos.length > 0) {
              // eslint-disable-next-line no-console
              console.log(
                '[FeedArticle] Found videos in Shadow DOM:',
                videos.length
              )
            }
          }, 200) // Increased delay to ensure DOM is fully parsed
        })
      })

      // Cleanup: restore original methods and disconnect observer when component unmounts or HTML changes
      return () => {
        // Disconnect MutationObserver
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obs = (shadowRoot as any)?._positionObserver
        if (obs) {
          obs.disconnect()
        }
        // Restore original document methods
        document.getElementById = originalGetElementById
        document.querySelector = originalQuerySelector
        document.querySelectorAll = originalQuerySelectorAll
        document.getElementsByClassName = originalGetElementsByClassName
        document.getElementsByTagName = originalGetElementsByTagName
      }
    }
  }, [
    injectedHtml,
    injectedScripts,
    injectedExternalScripts,
    injectedExternalStylesheets,
    setSelectedImageUrl,
  ])

  // Track scroll progress in iframe for readability/configured modes
  // Uses both direct iframe scroll events (web/desktop) and postMessage (Android WebView)
  useEffect(() => {
    if (viewMode !== 'readability' && viewMode !== 'configured') {
      setScrollProgress(0)
      return
    }

    const iframe = iframeRef.current

    // Listen for SCROLL_PROGRESS postMessage from iframe (works on Android WebView)
    const handleMessage = (event: MessageEvent) => {
      // eslint-disable-next-line no-console
      console.log(
        '[SCROLL_PROGRESS] Received message:',
        event.data?.type,
        event.data?.progress
      )
      if (
        event.data?.type === 'SCROLL_PROGRESS' &&
        typeof event.data.progress === 'number'
      ) {
        setScrollProgress(Math.min(100, Math.max(0, event.data.progress)))
      }
    }
    window.addEventListener('message', handleMessage)
    // eslint-disable-next-line no-console
    console.log('[SCROLL_PROGRESS] Listener registered for viewMode:', viewMode)

    // Also try direct iframe scroll events as fallback (works on web/desktop)
    const updateScrollProgress = () => {
      try {
        const iframeDoc =
          iframe?.contentDocument || iframe?.contentWindow?.document
        if (iframeDoc) {
          const scrollTop =
            iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop
          const scrollHeight =
            iframeDoc.documentElement.scrollHeight ||
            iframeDoc.body.scrollHeight
          const clientHeight =
            iframeDoc.documentElement.clientHeight ||
            iframeDoc.body.clientHeight
          const maxScroll = scrollHeight - clientHeight
          if (maxScroll > 0) {
            const progress = (scrollTop / maxScroll) * 100
            setScrollProgress(Math.min(100, Math.max(0, progress)))
          } else {
            setScrollProgress(0)
          }
        }
      } catch (_e) {
        // Cross-origin access denied - ignore, postMessage will handle it
      }
    }

    const handleLoad = () => {
      // eslint-disable-next-line no-console
      console.log(
        '[SCROLL_PROGRESS] handleLoad called, iframe:',
        !!iframe,
        'contentWindow:',
        !!iframe?.contentWindow
      )
      try {
        const iframeWindow = iframe?.contentWindow
        const iframeDoc = iframe?.contentDocument || iframeWindow?.document
        // eslint-disable-next-line no-console
        console.log(
          '[SCROLL_PROGRESS] iframeDoc:',
          !!iframeDoc,
          'body:',
          !!iframeDoc?.body
        )
        if (iframeWindow && iframeDoc && iframeDoc.body) {
          // Direct scroll listener (works on web/desktop)
          iframeWindow.addEventListener('scroll', updateScrollProgress)
          updateScrollProgress()

          // Inject scroll progress script into iframe for Android WebView
          // This ensures postMessage works from iframe to parent
          const script = iframeDoc.createElement('script')
          script.textContent = `
                        (function() {
                            var lastProgress = -1;
                            function reportScrollProgress() {
                                var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
                                var scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
                                var clientHeight = document.documentElement.clientHeight || document.body.clientHeight;
                                var maxScroll = scrollHeight - clientHeight;
                                var progress = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)) : 0;
                                var rounded = Math.round(progress);
                                if (rounded !== lastProgress && window.parent && window.parent !== window) {
                                    lastProgress = rounded;
                                    window.parent.postMessage({ type: 'SCROLL_PROGRESS', progress: progress }, '*');
                                }
                            }
                            window.addEventListener('scroll', reportScrollProgress, { passive: true });
                            document.addEventListener('scroll', reportScrollProgress, { passive: true });
                            document.addEventListener('touchmove', reportScrollProgress, { passive: true });
                            document.addEventListener('touchend', function() {
                                setTimeout(reportScrollProgress, 100);
                                setTimeout(reportScrollProgress, 300);
                            }, { passive: true });
                            reportScrollProgress();
                        })();
                    `
          iframeDoc.body.appendChild(script)
          // eslint-disable-next-line no-console
          console.log('[SCROLL_PROGRESS] Injected scroll script into iframe')
        } else {
          // eslint-disable-next-line no-console
          console.log('[SCROLL_PROGRESS] iframe not ready yet')
        }
      } catch (_e) {
        // eslint-disable-next-line no-console
        console.log(
          '[SCROLL_PROGRESS] Could not inject script into iframe:',
          _e
        )
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      '[SCROLL_PROGRESS] Setting up iframe listener, iframe ref:',
      !!iframe
    )
    if (iframe) {
      iframe.addEventListener('load', handleLoad)
      // Try immediately in case already loaded
      handleLoad()
    }

    return () => {
      window.removeEventListener('message', handleMessage)
      if (iframe) {
        iframe.removeEventListener('load', handleLoad)
        try {
          const iframeWindow = iframe.contentWindow
          if (iframeWindow) {
            iframeWindow.removeEventListener('scroll', updateScrollProgress)
          }
        } catch (_e) {
          // Cross-origin access denied - ignore
        }
      }
    }
  }, [viewMode, isLoading])

  // Ensure iframe viewport doesn't extend under native system UI.
  // Use CSS env() directly via inline styles - let the browser handle it natively.
  useEffect(() => {
    const iframe = iframeRef.current
    const injectedHtml = injectedHtmlRef.current

    if (iframe) {
      iframe.style.height =
        'calc(100% - calc(env(safe-area-inset-bottom, 0px) / 2))'
    }

    if (injectedHtml) {
      injectedHtml.style.height =
        'calc(100% - calc(env(safe-area-inset-bottom, 0px) / 2))'
    }
  }, [])

  const handleViewModeChange = async (mode: ArticleViewMode) => {
    // eslint-disable-next-line no-console
    console.log(`[FeedArticle] handleViewModeChange called: ${mode}`)

    setViewMode(mode)

    // Save preference to storage for this feed
    const feedId = item.feed?.id || 'default'
    // eslint-disable-next-line no-console
    console.log(`[FeedArticle] Saving view mode "${mode}" for feed ${feedId}`)
    await setArticleViewMode(feedId, mode)

    // Verify it was saved
    const verifyMode = await getArticleViewMode(feedId)
    // eslint-disable-next-line no-console
    console.log(
      `[FeedArticle] Verification: saved mode is now "${verifyMode}" (expected "${mode}")`
    )
  }

  return (
    <div
      className={cn('flex h-full w-full flex-col items-start', {
        flex: isMobile,
        'absolute inset-0 left-full z-50 hidden w-full flex-1 transition-all duration-200 sm:static sm:z-auto sm:flex':
          !isMobile,
        // In landscape mobile mode, remove borders, padding, and margins to maximize width
        'm-0 rounded-none border-0 p-0': isMobile && isLandscape,
      })}
      style={
        isMobile && isLandscape
          ? { width: '100vw', maxWidth: '100vw' }
          : undefined
      }
    >
      <div
        className={cn(
          'bg-primary-foreground flex h-full w-full flex-col rounded-md border shadow-sm',
          {
            // In landscape mobile mode, remove borders, padding, and margins to maximize width
            'm-0 rounded-none border-0 p-0': isMobile && isLandscape,
          }
        )}
        style={{ maxWidth: isMobile ? undefined : '800px' }}
      >
        <div
          className={cn(
            'bg-background mb-1 flex h-full flex-none flex-col rounded-t-md shadow-lg',
            {
              // In landscape mode, remove margins to maximize width
              'mb-0': isMobile && isLandscape,
            }
          )}
        >
          <div className='flex h-12 flex-none items-center justify-between p-2'>
            <ArticleToolbar
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              articleUrl={item.url}
              feedFaviconUrl={item.feed?.faviconUrl}
              articleTitle={item.title}
              feedId={item.feed?.id}
              hasSelectorConfig={selectorConfigExists}
              isMobile={isMobile}
              isLandscape={isLandscape}
              onBack={onBack}
            />
          </div>
          {/* Scroll progress bar - only visible in readability/configured modes */}
          {(viewMode === 'readability' || viewMode === 'configured') && (
            <div
              className='h-[2px] w-full flex-none'
              style={{ backgroundColor: 'transparent' }}
            >
              <div
                className={cn(
                  'h-full transition-all duration-150 ease-out',
                  theme === 'dark' ? 'bg-white/70' : 'bg-black/70'
                )}
                style={{ width: `${scrollProgress}%` }}
              />
            </div>
          )}
          {/* container must NOT be the scroll host when rendering an iframe; let the iframe scroll internally */}
          <div
            data-article-container
            className='relative min-h-0 w-full flex-1'
            style={{
              // Enable pinch-to-zoom on Android - use manipulation for better compatibility
              touchAction: 'manipulation',
              // Ensure container has explicit height for iframe
              height: '100%',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {isLoading && (
              <div className='bg-background/80 absolute inset-0 z-10 flex items-center justify-center'>
                <div className='flex flex-col items-center space-y-4'>
                  <Skeleton className='border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent' />
                  <p className='text-muted-foreground text-sm'>
                    Loading article...
                  </p>
                </div>
              </div>
            )}
            {error && (
              <div className='bg-background/80 absolute inset-0 z-10 flex items-center justify-center p-4'>
                <div className='flex flex-col items-center space-y-3 text-center'>
                  <p className='text-sm text-red-500'>{error}</p>
                  <div className='flex space-x-2'>
                    <button
                      className='bg-primary text-primary-foreground rounded px-3 py-1'
                      onClick={() => {
                        // Clear error and retry by toggling viewMode to force the effect
                        const currentMode = viewMode
                        setError(null)
                        setIsLoading(true)
                        // trigger the effect by toggling viewMode away and back to the same mode
                        setViewMode((v) =>
                          v === 'readability' ? 'original' : 'readability'
                        )
                        setTimeout(() => setViewMode(currentMode), 50)
                      }}
                    >
                      Retry
                    </button>
                    <button
                      className='rounded border px-3 py-1'
                      onClick={() => setViewMode('original')}
                    >
                      See original
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!error &&
              (viewMode === 'readability' || viewMode === 'configured' ? (
                <iframe
                  key={`${item.id}-${item.url}-${viewMode}`}
                  ref={iframeRef}
                  className={cn('block w-full', {
                    invisible: isLoading,
                  })}
                  src='about:blank'
                  title='Feed article'
                  sandbox='allow-scripts allow-same-origin allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-top-navigation-by-user-activation'
                  allow='fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share; accelerometer; gyroscope; magnetometer'
                  allowFullScreen
                  style={{
                    border: 0,
                    height: '100%',
                    minHeight: '100%',
                    // Enable pinch-to-zoom on Android - use manipulation for better compatibility
                    touchAction: 'manipulation',
                  }}
                />
              ) : (
                <div
                  ref={injectedHtmlRef}
                  className={cn('block h-full w-full overflow-auto', {
                    invisible: isLoading,
                  })}
                  style={{
                    border: 0,
                    // Isolate styles from the rest of the app
                    isolation: 'isolate',
                    // Enable pinch-to-zoom on Android - use manipulation for better compatibility
                    touchAction: 'manipulation',
                    WebkitOverflowScrolling: 'touch',
                    // Ensure container can scroll when content is zoomed
                    overflowX: 'auto',
                    overflowY: 'auto',
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length === 2) {
                      // eslint-disable-next-line no-console
                      console.log(
                        '[ZOOM-DIAG] Shadow DOM container: Pinch start detected, touches:',
                        e.touches.length
                      )
                    }
                  }}
                />
              ))}
          </div>
        </div>

        {/* Floating action button - mobile only: modes + source */}
        {isMobile && (
          <div
            className='fixed right-4 z-50'
            style={{
              bottom: 'calc(1rem + env(safe-area-inset-bottom))',
            }}
          >
            <FloatingActionButton
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              articleUrl={item.url}
              hasSelectorConfig={selectorConfigExists}
            />
          </div>
        )}

        {/* Auth Dialog */}
        {authDialog && (
          <AuthDialog
            open={true}
            domain={authDialog.domain}
            onSubmit={handleAuthSubmit}
            onCancel={handleAuthCancel}
          />
        )}

        {/* Image Context Menu */}
        <ImageContextMenu
          imageUrl={selectedImageUrl}
          onClose={() => setSelectedImageUrl(null)}
        />

        {/* YouTube Video Modal */}
        {youtubeVideo && (
          <div
            className='fixed inset-0 z-[100] flex items-center justify-center bg-black/80'
            onClick={() => setYoutubeVideo(null)}
          >
            <div
              className='relative mx-4 w-full max-w-4xl'
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                className='absolute -top-10 right-0 p-2 text-xl text-white hover:text-gray-300'
                onClick={() => setYoutubeVideo(null)}
                aria-label='Close video'
              >
                ✕
              </button>
              {/* Video title */}
              {youtubeVideo.title && (
                <p className='mb-2 truncate text-sm text-white'>
                  {youtubeVideo.title}
                </p>
              )}
              {/* YouTube iframe - rendered at app level, not nested in blob iframe */}
              <div
                className='relative w-full'
                style={{ paddingBottom: '56.25%' }}
              >
                <iframe
                  className='absolute inset-0 h-full w-full'
                  src={`https://www.youtube-nocookie.com/embed/${youtubeVideo.videoId}?autoplay=1&rel=0`}
                  title={youtubeVideo.title || 'YouTube video'}
                  allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                  allowFullScreen
                  style={{ border: 0 }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Memoize to prevent re-renders when parent re-renders due to orientation changes
// Only re-render if item.id or isMobile actually changes
export const FeedArticle = memo(
  FeedArticleComponent,
  (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render), false if they differ (re-render)
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.isMobile === nextProps.isMobile
    )
  }
)
