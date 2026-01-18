import { ArticleToolbar, ArticleViewMode } from "./ArticleToolbar"
import { getArticleViewMode, getArticleViewModeSync, setArticleViewMode } from '@/lib/article-view-storage'
import { handleOriginalView, handleReadabilityView } from './article-view-handlers'
import { memo, useEffect, useRef, useState } from "react"

import { AuthDialog } from "@/components/auth-dialog"
import { Capacitor } from "@capacitor/core"
import { FeedItem } from "@/backends/types"
import { FloatingActionButton } from "./FloatingActionButton"
import { ImageContextMenu } from "@/components/image-context-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { getShadowDomZoomScript } from './article-zoom-scripts'
import { prepareHtmlForShadowDom } from './article-html-preparation'
import { safeInvoke } from '@/lib/safe-invoke'
import { storeAuth } from '@/lib/auth-storage'
import { useFontSize } from '@/context/font-size-context'
import { useOrientation } from '@/hooks/use-orientation'
import { useTheme } from "@/context/theme-context"

type FeedArticleProps = {
    item: FeedItem
    isMobile?: boolean
    onBack?: () => void
}

function FeedArticleComponent({ item, isMobile = false, onBack }: FeedArticleProps) {
    const { theme } = useTheme()
    const { fontSize } = useFontSize()
    const isLandscape = useOrientation()

    const [isLoading, setIsLoading] = useState(true)
    const [articleContent, setArticleContent] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [injectedHtml, setInjectedHtml] = useState<string | null>(null) // For direct HTML injection (original mode)
    const [injectedScripts, setInjectedScripts] = useState<string[]>([]) // Inline scripts to execute separately
    const [injectedExternalScripts, setInjectedExternalScripts] = useState<string[]>([]) // External scripts (with src) to load
    const [injectedExternalStylesheets, setInjectedExternalStylesheets] = useState<string[]>([]) // External stylesheets to load
    
    // Initialize viewMode from storage (per feed), default to "readability"
    // Use a state to track if viewMode is loaded (to avoid loading article before mode is known)
    const [viewMode, setViewMode] = useState<ArticleViewMode>(() => {
        // Try to load synchronously from storage on initial render
        // For Capacitor, this will return 'readability' and we'll load async in useEffect
        const feedId = item.feed?.id || 'default'
        return getArticleViewModeSync(feedId)
    })
    const [viewModeLoaded, setViewModeLoaded] = useState<boolean>(() => {
        // On web, we can load synchronously, so it's already loaded
        // On Capacitor, we need to load async, so it's not loaded yet
        if (typeof window !== 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const win = window as any
            return win.Capacitor?.getPlatform?.() !== 'android'
        }
        return true
    })
    
    const [proxyPort, setProxyPort] = useState<number | null>(null)
    const [authDialog, setAuthDialog] = useState<{ domain: string } | null>(null)
    const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)

    const iframeRef = useRef<HTMLIFrameElement>(null)
    const injectedHtmlRef = useRef<HTMLDivElement>(null) // For direct HTML injection

    // Now all view modes use iframe for isolated scroll context
    const isIframeView = true

    // Load view mode from storage when feed or article changes (for Capacitor)
    // This MUST complete before the article loading useEffect runs
    useEffect(() => {
        const feedId = item.feed?.id || 'default'
        
        // eslint-disable-next-line no-console
        console.log(`[FeedArticle] Loading view mode for feed ${feedId}, article ${item.url}, current mode: ${viewMode}`)
        
        // On Capacitor, we need to load async, so mark as not loaded yet
        if (typeof window !== 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const win = window as any
            if (win.Capacitor?.getPlatform?.() === 'android') {
                setViewModeLoaded(false)
            }
        }
        
        // Load saved mode asynchronously (needed for Capacitor)
        getArticleViewMode(feedId).then((savedMode) => {
            // eslint-disable-next-line no-console
            console.log(`[FeedArticle] Loaded saved mode: ${savedMode}, current: ${viewMode}`)
            // Update mode if different
            if (savedMode !== viewMode) {
                // eslint-disable-next-line no-console
                console.log(`[FeedArticle] Setting viewMode to ${savedMode} (was ${viewMode})`)
                setViewMode(savedMode)
            }
            // Mark as loaded - this will allow the article loading useEffect to run
            setViewModeLoaded(true)
        }).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[FeedArticle] Failed to load view mode:', err)
            // On error, use current mode and mark as loaded
            setViewModeLoaded(true)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.feed?.id, item.url]) // Don't include viewMode to avoid loop - we only want to load when feed/article changes

    useEffect(() => {
        // Start the proxy (Tauri or Capacitor) if available; ignore errors in browser dev
        const startProxy = async () => {
            // eslint-disable-next-line no-console
            console.log('[FeedArticle] Starting proxy initialization...')
            // Try Tauri first (desktop)
            try {
                const port = await safeInvoke("start_proxy")
                setProxyPort(Number(port))
                // eslint-disable-next-line no-console
                console.log('[FeedArticle] ✓ Tauri proxy started on port:', port)
                return
            } catch (tauriErr) {
                // Tauri not available, try Capacitor (Android)
                const errorMsg = tauriErr instanceof Error ? tauriErr.message : String(tauriErr)
                // eslint-disable-next-line no-console
                console.log('[FeedArticle] Tauri not available, error:', errorMsg)
                // Check for various Tauri not available error messages
                const isTauriNotAvailable = 
                    errorMsg.includes('Tauri invoke not available') ||
                    errorMsg.includes('Cannot read properties of undefined') ||
                    (errorMsg.includes('invoke') && errorMsg.includes('undefined'))
                
                if (isTauriNotAvailable) {
                    try {
                        // eslint-disable-next-line no-console
                        console.log('[FeedArticle] Attempting to start Capacitor proxy...')
                        const { startProxyServer } = await import('@/lib/raw-html')
                        const port = await startProxyServer()
                        if (port) {
                            setProxyPort(port)
                            // eslint-disable-next-line no-console
                            console.log('[FeedArticle] ✓ Capacitor proxy started on port:', port)
                        } else {
                            // eslint-disable-next-line no-console
                            console.warn('[FeedArticle] Capacitor proxy returned null port')
                        }
                    } catch (capErr) {
                        // eslint-disable-next-line no-console
                        console.error('[FeedArticle] ✗ Capacitor proxy failed:', capErr)
                        const errorDetails = capErr instanceof Error ? capErr.message : String(capErr)
                        // eslint-disable-next-line no-console
                        console.error('[FeedArticle] Error details:', errorDetails)
                    }
                } else {
                    // eslint-disable-next-line no-console
                    console.debug('[FeedArticle] Tauri proxy not available or failed (dev):', tauriErr)
                }
            }
        }
        
        startProxy()
    }, [])


    // Use ref to track the last loaded URL to prevent unnecessary reloads
    const lastLoadedUrlRef = useRef<string | null>(null)
    const lastViewModeRef = useRef<ArticleViewMode | null>(null)
    const lastThemeRef = useRef<string | null>(null)
    const lastFontSizeRef = useRef<string | null>(null)

    useEffect(() => {
        // CRITICAL: Don't load article until viewMode is loaded (on Capacitor)
        // This prevents double loading (readability -> original)
        if (!viewModeLoaded) {
            // eslint-disable-next-line no-console
            console.log('⏳ [FeedArticle] Waiting for viewMode to load before loading article...')
            return
        }
        
        // Skip reload if URL, viewMode, theme, and fontSize haven't changed
        // Only reload if URL or viewMode changes (not theme/fontSize for readability mode)
        const urlChanged = lastLoadedUrlRef.current !== item.url
        const viewModeChanged = lastViewModeRef.current !== viewMode
        const themeChanged = lastThemeRef.current !== theme
        const fontSizeChanged = lastFontSizeRef.current !== fontSize
        
        // eslint-disable-next-line no-console
        console.log('🟡 [FeedArticle] useEffect triggered', {
            urlChanged,
            viewModeChanged,
            themeChanged,
            fontSizeChanged,
            currentUrl: item.url,
            lastUrl: lastLoadedUrlRef.current,
            currentViewMode: viewMode,
            lastViewMode: lastViewModeRef.current,
            isMobile,
            isLandscape,
            viewModeLoaded,
        })
        // Log séparé pour faciliter le grep
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] urlChanged=' + urlChanged + ' viewModeChanged=' + viewModeChanged + ' viewModeLoaded=' + viewModeLoaded)
        
        // For readability mode, theme and fontSize changes should update the blob without full reload
        // For other modes, only reload if URL or viewMode changes
        if (!urlChanged && !viewModeChanged) {
            // If only theme/fontSize changed and we're in readability mode, update the iframe content
            if (viewMode === 'readability' && (themeChanged || fontSizeChanged)) {
                // Update refs
                lastThemeRef.current = theme
                lastFontSizeRef.current = fontSize
                // eslint-disable-next-line no-console
                console.log('🟠 [FeedArticle] Only theme/fontSize changed, updating blob')
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
        lastLoadedUrlRef.current = item.url || null
        lastViewModeRef.current = viewMode
        lastThemeRef.current = theme
        lastFontSizeRef.current = fontSize
        
        // eslint-disable-next-line no-console
        console.log('🔴 [FeedArticle] Reloading article', {
            url: item.url,
            viewMode,
            viewModeLoaded,
        })
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] RELOADING url=' + item.url + ' viewMode=' + viewMode)

        const setIframeUrl = (url: string) => {
            if (iframeRef.current) iframeRef.current.src = url
        }

        // eslint-disable-next-line no-console
        console.log('[FeedArticle] About to load article, proxyPort:', proxyPort)
        
        if (viewMode === "readability") {
            handleReadabilityView({
                url: item.url || '',
                proxyPort,
                theme,
                fontSize,
                setArticleContent,
                setError,
                setIsLoading,
                setAuthDialog,
                setIframeUrl,
            })
        } else if (viewMode === "original") {
            // eslint-disable-next-line no-console
            console.log('[FeedArticle] Calling handleOriginalView with proxyPort:', proxyPort)
            handleOriginalView({
                url: item.url || '',
                proxyPort,
                setInjectedHtml,
                setInjectedScripts,
                setInjectedExternalScripts,
                setInjectedExternalStylesheets,
                setError,
                setIsLoading,
                prepareHtmlForShadowDom,
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.url, viewMode, proxyPort, theme, fontSize, viewModeLoaded]) // isMobile and isLandscape are intentionally excluded - they shouldn't trigger reload

    useEffect(() => {
        const iframe = iframeRef.current
        if (!isIframeView || !iframe) {
            return
        }

        const handleLoad = () => {
            setIsLoading(false)
            
            if (iframe.contentWindow) {
                // Check iframe document for diagnostics (same-origin only, for blob URLs in readability mode)
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document
                    if (doc) {
                        const h = doc.documentElement?.scrollHeight || doc.body?.scrollHeight
                        // eslint-disable-next-line no-console
                        console.debug('[DIAG] FeedArticle: iframe document scrollHeight (same-origin):', h)
                        
                        // Check viewport meta for zoom support
                        const viewportMeta = doc.querySelector('meta[name="viewport"]')
                        if (viewportMeta) {
                            // eslint-disable-next-line no-console
                            console.debug('[DIAG] FeedArticle: iframe viewport meta:', viewportMeta.getAttribute('content'))
                        } else {
                            // eslint-disable-next-line no-console
                            console.warn('[DIAG] FeedArticle: iframe viewport meta NOT FOUND - zoom may not work!')
                        }
                        
                        // Log touch-action styles
                        const htmlEl = doc.documentElement
                        const bodyEl = doc.body
                        if (htmlEl) {
                            const htmlStyle = window.getComputedStyle(htmlEl)
                            // eslint-disable-next-line no-console
                            console.debug('[DIAG] FeedArticle: iframe html touch-action:', htmlStyle.touchAction)
                        }
                        if (bodyEl) {
                            const bodyStyle = window.getComputedStyle(bodyEl)
                            // eslint-disable-next-line no-console
                            console.debug('[DIAG] FeedArticle: iframe body touch-action:', bodyStyle.touchAction)
                        }
                    }
                } catch (_e) {
                    // eslint-disable-next-line no-console
                    console.debug('[DIAG] FeedArticle: iframe same-origin access denied (cross-origin)')
                }
            }
        }

        iframe.addEventListener("load", handleLoad)
        return () => {
            iframe.removeEventListener("load", handleLoad)
        }
    }, [isIframeView, viewMode, theme, proxyPort, item.url])

    // Layout probes: measure viewport and article/iframe sizes and padding so we can
    // understand why content is ending up underneath the Android navigation area.
    useEffect(() => {
        const logMeasurements = () => {
            try {
                // Basic viewport metrics
                const windowInnerHeight = typeof window !== 'undefined' ? window.innerHeight : undefined
                // Use a typed-safe access to visualViewport to satisfy lint rules
                const visualViewport = typeof window !== 'undefined' && (window as unknown as Window & { visualViewport?: { height?: number } }).visualViewport
                const visualViewportHeight = visualViewport ? visualViewport.height : undefined

                // Container scroll area that holds iframe
                const containerEl = document.querySelector('.relative.h-full.w-full.overflow-auto') as HTMLElement | null
                let containerRect = null
                if (containerEl) {
                    const cr = containerEl.getBoundingClientRect()
                    containerRect = { top: cr.top, bottom: cr.bottom, height: cr.height }
                }

                // Iframe metrics (if present)
                const iframe = iframeRef.current
                let iframeRect = null
                if (iframe) {
                    const ir = iframe.getBoundingClientRect()
                    iframeRect = { top: ir.top, bottom: ir.bottom, height: ir.height }
                }

                // Probe safe-area-inset-bottom via env() by creating a temporary element.
                let measuredSafeAreaInsetBottom: number | string = 'n/a'
                try {
                    const probe = document.createElement('div')
                    probe.style.position = 'absolute'
                    probe.style.left = '-9999px'
                    probe.style.height = 'env(safe-area-inset-bottom, 0px)'
                    document.body.appendChild(probe)
                    measuredSafeAreaInsetBottom = probe.offsetHeight
                    document.body.removeChild(probe)
                } catch (_e) {
                    measuredSafeAreaInsetBottom = 'err'
                }

                // eslint-disable-next-line no-console
                console.debug('[DIAG] FeedArticle: layout', JSON.stringify({
                    viewMode,
                    windowInnerHeight,
                    visualViewportHeight,
                    containerRect,
                    iframeRect,
                    measuredSafeAreaInsetBottom,
                    articleContentLength: articleContent?.length,
                }))
            } catch (err) {
                // eslint-disable-next-line no-console
                console.debug('[DIAG] FeedArticle: layout probe failed', err)
            }
        }

        logMeasurements()
        window.addEventListener('resize', logMeasurements)
        window.addEventListener('orientationchange', logMeasurements)
        return () => {
            window.removeEventListener('resize', logMeasurements)
            window.removeEventListener('orientationchange', logMeasurements)
        }
    }, [viewMode, articleContent])

    // Listen for auth requests from proxy via postMessage
    // Also listen for image long press events from iframe
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.data?.type === 'PROXY_AUTH_REQUIRED' && event.data?.domain) {
                const { domain } = event.data
                setAuthDialog({ domain })
            } else if (event.data?.type === 'IMAGE_LONG_PRESS' && event.data?.imageUrl) {
                // Only show menu on Android
                if (Capacitor.getPlatform() === 'android') {
                    setSelectedImageUrl(event.data.imageUrl)
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
            // Try Capacitor (Android)
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const win = window as any
                const Plugins = win?.Capacitor?.Plugins
                if (Plugins?.RawHtml?.setProxyAuth) {
                    await Plugins.RawHtml.setProxyAuth({ domain, username, password })
                }
            } catch (_e2) {
                // Ignore
            }
        }
        
        setAuthDialog(null)
        
        // Reload the current view to retry with auth
        if (viewMode === 'readability') {
            // Trigger a re-render by changing view mode temporarily
            // This will cause the useEffect to re-run and retry fetchRawHtml with auth
            setViewMode('original')
            setTimeout(() => setViewMode('readability'), 10)
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
                        const existingLink = shadowRoot.querySelector(`link[href="${href}"]`)
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
                            console.warn('[FeedArticle] Failed to load external stylesheet:', href)
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
            const originalGetElementsByClassName = document.getElementsByClassName.bind(document)
            const originalGetElementsByTagName = document.getElementsByTagName.bind(document)
            
            // Load external scripts (they need to be loaded before inline scripts can use them)
            const loadExternalScripts = async () => {
                const scriptPromises = injectedExternalScripts.map((scriptSrc) => {
                    return new Promise<void>((resolve) => {
                        // Check if script is already loaded
                        const existingScript = document.querySelector(`script[src="${scriptSrc}"]`)
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
                            console.warn('[FeedArticle] Failed to load external script:', scriptSrc)
                            resolve() // Continue even if script fails to load
                        }
                        document.head.appendChild(script)
                    })
                })
                
                await Promise.all(scriptPromises)
            }
            
            // Permanently redirect document methods to search in shadow root first
            // This is needed because scripts may use async callbacks (like DOMContentLoaded)
            document.getElementById = function(id: string) {
                // ShadowRoot doesn't have getElementById, use querySelector instead
                const shadowElement = shadowRoot.querySelector('#' + id)
                if (shadowElement) {
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] Found element in shadow DOM:', id)
                    return shadowElement as HTMLElement | null
                }
                return originalGetElementById.call(document, id)
            }
            document.querySelector = function(selector: string) {
                const shadowElement = shadowRoot.querySelector(selector)
                return shadowElement || originalQuerySelector.call(document, selector)
            }
            document.querySelectorAll = function(selector: string) {
                const shadowResults = shadowRoot.querySelectorAll(selector)
                return shadowResults.length > 0 ? shadowResults : originalQuerySelectorAll.call(document, selector)
            }
            document.getElementsByClassName = function(className: string) {
                const shadowResults = shadowRoot.querySelectorAll('.' + className)
                return shadowResults.length > 0 ? (shadowResults as unknown as HTMLCollectionOf<Element>) : originalGetElementsByClassName.call(document, className)
            }
            document.getElementsByTagName = function(tagName: string) {
                const shadowResults = shadowRoot.querySelectorAll(tagName)
                return shadowResults.length > 0 ? (shadowResults as unknown as HTMLCollectionOf<Element>) : originalGetElementsByTagName.call(document, tagName)
            }
            
            // Load stylesheets first, then inject HTML, then load scripts
            // Use .then() since useEffect callback cannot be async
            loadExternalStylesheets().then(() => {

                
                // Inject HTML into shadow root (without scripts - they're executed separately)
                // Security: This is intentional - we're injecting proxied HTML content from trusted sources
                shadowRoot.innerHTML = injectedHtml
                
                // Add zoom implementation script to shadow DOM
                const zoomScript = shadowRoot.ownerDocument.createElement('script')
                zoomScript.textContent = getShadowDomZoomScript()
                shadowRoot.appendChild(zoomScript)
                
                // Setup image long press handlers for Android
                if (Capacitor.getPlatform() === 'android') {
                    const setupImageLongPress = () => {
                        const images = shadowRoot.querySelectorAll('img')
                        images.forEach((img) => {
                            // Prevent default context menu
                            img.addEventListener('contextmenu', (e) => {
                                e.preventDefault()
                                const imageUrl = (img as HTMLImageElement).src || 
                                               img.getAttribute('data-src') || 
                                               img.getAttribute('data-lazy-src')
                                if (imageUrl) {
                                    // eslint-disable-next-line no-console
                                    console.log('[FeedArticle] Image long press detected, setting selectedImageUrl:', imageUrl)
                                    setSelectedImageUrl(imageUrl)
                                }
                            })
                            
                            // Touch events for mobile
                            let touchStartTime: number | null = null
                            let touchStartPos: { x: number; y: number } | null = null
                            img.addEventListener('touchstart', (e) => {
                                touchStartTime = Date.now()
                                if (e.touches.length === 1) {
                                    touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }
                                }
                            })
                            
                            img.addEventListener('touchend', (e) => {
                                if (touchStartTime && Date.now() - touchStartTime >= 500) {
                                    // Check if finger didn't move much (long press, not drag)
                                    const moved = touchStartPos && e.changedTouches[0] && 
                                                 (Math.abs(e.changedTouches[0].clientX - touchStartPos.x) > 10 ||
                                                  Math.abs(e.changedTouches[0].clientY - touchStartPos.y) > 10)
                                    if (!moved) {
                                        e.preventDefault()
                                        const imageUrl = (img as HTMLImageElement).src || 
                                                       img.getAttribute('data-src') || 
                                                       img.getAttribute('data-lazy-src')
                                        if (imageUrl) {
                                            // eslint-disable-next-line no-console
                                            console.log('[FeedArticle] Image long press detected (touch), setting selectedImageUrl:', imageUrl)
                                            setSelectedImageUrl(imageUrl)
                                        }
                                    }
                                }
                                touchStartTime = null
                                touchStartPos = null
                            })
                            
                            img.addEventListener('touchmove', () => {
                                touchStartTime = null
                                touchStartPos = null
                            })
                        })
                    }
                    
                    setupImageLongPress()
                    
                    // Watch for dynamically added images
                    const imageObserver = new MutationObserver(() => {
                        setupImageLongPress()
                    })
                    imageObserver.observe(shadowRoot, { childList: true, subtree: true })
                    
                    // Store observer for cleanup
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ;(shadowRoot as any)._imageObserver = imageObserver
                }
                
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
                observer.observe(shadowRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
                
                // Store observer reference for cleanup
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(shadowRoot as any)._positionObserver = observer
                
                // Continue with script loading after HTML is injected
                loadExternalScripts().then(() => {
                // Wait a bit to ensure DOM is fully parsed
                setTimeout(() => {
                    // Verify elements are in shadow DOM before executing scripts
                    const testElement = shadowRoot.querySelector('#tweet_1986189869287170303') || 
                                        shadowRoot.querySelector('[id^="tweet_"]') ||
                                        shadowRoot.querySelector('div[id]')
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] Shadow DOM test element:', testElement ? 'found' : 'not found')
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] Shadow DOM HTML length:', shadowRoot.innerHTML.length)
                    
                    // Execute inline scripts (document methods are already redirected)
                    injectedScripts.forEach((scriptContent, index) => {
                        try {
                            // eslint-disable-next-line no-console
                            console.log('[FeedArticle] Executing script', index + 1, 'of', injectedScripts.length)
                            // Execute script directly - document methods are already redirected
                            const scriptFunction = new Function('document', 'window', scriptContent)
                            scriptFunction(document, window)
                        } catch (err) {
                            // eslint-disable-next-line no-console
                            console.error('[FeedArticle] Error executing script in Shadow DOM:', err)
                        }
                    })
                    
                    // Trigger DOMContentLoaded event AFTER scripts are executed
                    // This ensures that async callbacks can use the redirected document methods
                    const domContentLoadedEvent = new Event('DOMContentLoaded', {
                        bubbles: true,
                        cancelable: true
                    })
                    window.dispatchEvent(domContentLoadedEvent)
                    document.dispatchEvent(domContentLoadedEvent)
                    
                    // Log videos found in Shadow DOM after scripts have executed
                    const videos = shadowRoot.querySelectorAll('video')
                    if (videos && videos.length > 0) {
                        // eslint-disable-next-line no-console
                        console.log('[FeedArticle] Found videos in Shadow DOM:', videos.length)
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
                // Disconnect image observer
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgObs = (shadowRoot as any)?._imageObserver
                if (imgObs) {
                    imgObs.disconnect()
                }
                // Restore original document methods
                document.getElementById = originalGetElementById
                document.querySelector = originalQuerySelector
                document.querySelectorAll = originalQuerySelectorAll
                document.getElementsByClassName = originalGetElementsByClassName
                document.getElementsByTagName = originalGetElementsByTagName
            }
        }
    }, [injectedHtml, injectedScripts, injectedExternalScripts, injectedExternalStylesheets, setSelectedImageUrl])

    // Ensure iframe viewport doesn't extend under native system UI.
    // Use CSS env() directly via inline styles - simpler and more stable than dynamic JS adjustments.
    useEffect(() => {
        const iframe = iframeRef.current
        const injectedHtml = injectedHtmlRef.current
        
        // Set height using CSS env() - let the browser handle it natively
        // Use only half of safe-area-inset-bottom to reduce excessive bottom margin
        if (iframe) {
            iframe.style.height = 'calc(100% - calc(env(safe-area-inset-bottom, 0px) / 2))'
        }
        
        if (injectedHtml) {
            injectedHtml.style.height = 'calc(100% - calc(env(safe-area-inset-bottom, 0px) / 2))'
        }
        
        // Only listen to Capacitor plugin events for native insets (more reliable than probing)
        const handler = (ev: Event) => {
            try {
                const ce = ev as CustomEvent & { detail?: { bottom?: number } }
                const safeInset = Number(ce?.detail?.bottom) || 0
                
                // Validate inset value (can be up to ~200px on modern Android devices with gesture navigation)
                if (safeInset > 250) {
                    // eslint-disable-next-line no-console
                    console.warn('[FeedArticle] Suspicious inset value from Capacitor:', safeInset, '- ignoring');
                    return;
                }
                
                // Apply half of the inset to reduce excessive bottom margin
                const adjustedInset = safeInset / 2;
                
                if (iframe) {
                    iframe.style.height = `calc(100% - ${adjustedInset}px)`
                }
                if (injectedHtml) {
                    injectedHtml.style.height = `calc(100% - ${adjustedInset}px)`
                }
            } catch (_e) {
                // ignore
            }
        }
        
        // Only listen to Capacitor plugin events - don't adjust on resize/visibilitychange
        // as those cause flickering. Let CSS env() handle it automatically.
        window.addEventListener('capacitor-window-insets', handler as EventListener)
        
        return () => {
            window.removeEventListener('capacitor-window-insets', handler as EventListener)
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
        console.log(`[FeedArticle] Verification: saved mode is now "${verifyMode}" (expected "${mode}")`)
    }

    return (
        <div
            className={cn(
                "flex h-full w-full flex-col rounded-md border bg-primary-foreground shadow-sm",
                {
                    flex: isMobile,
                    "absolute inset-0 left-full z-50 hidden w-full flex-1 transition-all duration-200 sm:static sm:z-auto sm:flex":
                        !isMobile,
                    // In landscape mobile mode, remove borders, padding, and margins to maximize width
                    "rounded-none border-0 m-0 p-0": isMobile && isLandscape,
                },
            )}
            style={isMobile && isLandscape ? { width: '100vw', maxWidth: '100vw' } : undefined}
        >
            <div className={cn(
                "mb-1 flex h-full flex-none flex-col rounded-t-md bg-secondary shadow-lg",
                {
                    // In landscape mode, remove margins to maximize width
                    "mb-0": isMobile && isLandscape,
                }
            )} style={{ backgroundColor: 'rgb(34, 34, 34)' }}>
                <div className="flex items-center justify-between p-2 h-12 flex-none">
                    <ArticleToolbar 
                        viewMode={viewMode} 
                        onViewModeChange={handleViewModeChange} 
                        articleUrl={item.url}
                        feedFaviconUrl={item.feed?.faviconUrl}
                        articleTitle={item.title}
                        isMobile={isMobile}
                        isLandscape={isLandscape}
                        onBack={onBack}
                    />
                </div>
                {/* container must NOT be the scroll host when rendering an iframe; let the iframe scroll internally */}
                <div 
                    data-article-container 
                    className="relative flex-1 w-full min-h-0"
                    style={{
                        // Enable pinch-to-zoom on Android
                        touchAction: 'pan-x pan-y pinch-zoom',
                        // Ensure container has explicit height for iframe
                        height: '100%',
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {isLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                            <div className="flex flex-col items-center space-y-4">
                                <Skeleton className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                <p className="text-sm text-muted-foreground">Loading article...</p>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4">
                            <div className="flex flex-col items-center space-y-3 text-center">
                                <p className="text-sm text-red-500">{error}</p>
                                <div className="flex space-x-2">
                                    <button className="px-3 py-1 rounded bg-primary text-primary-foreground" onClick={() => {
                                        // Clear error and retry by toggling viewMode to force the effect
                                        setError(null)
                                        setIsLoading(true)
                                        // trigger the effect by toggling viewMode away and back
                                        setViewMode((v) => (v === 'readability' ? 'original' : 'readability'))
                                        setTimeout(() => setViewMode('readability'), 50)
                                    }}>Retry</button>
                                    <button className="px-3 py-1 rounded border" onClick={() => setViewMode('original')}>See original</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {!error && (
                        viewMode === 'readability' ? (
                            <iframe
                                key={`${item.id}-${item.url}`}
                                ref={iframeRef}
                                className={cn("block w-full", {
                                    invisible: isLoading,
                                })}
                                src="about:blank"
                                title="Feed article"
                                sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-top-navigation-by-user-activation"
                                allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share; accelerometer; gyroscope; magnetometer"
                                allowFullScreen
                                style={{ 
                                    border: 0,
                                    height: '100%',
                                    minHeight: '100%',
                                    // Enable pinch-to-zoom on Android
                                    touchAction: 'pan-x pan-y pinch-zoom'
                                }}
                            />
                        ) : (
                            <div
                                ref={injectedHtmlRef}
                                className={cn("block h-full w-full overflow-auto", {
                                    invisible: isLoading,
                                })}
                                style={{ 
                                    border: 0,
                                    // Isolate styles from the rest of the app
                                    isolation: 'isolate',
                                    // Enable pinch-to-zoom on Android
                                    touchAction: 'pan-x pan-y pinch-zoom',
                                    WebkitOverflowScrolling: 'touch',
                                    // Ensure container can scroll when content is zoomed
                                    overflowX: 'auto',
                                    overflowY: 'auto'
                                }}
                                onTouchStart={(e) => {
                                    if (e.touches.length === 2) {
                                        // eslint-disable-next-line no-console
                                        console.log('[ZOOM-DIAG] Shadow DOM container: Pinch start detected, touches:', e.touches.length)
                                    }
                                }}
                            />
                        )
                    )}
                </div>
            </div>
            
            {/* Floating action button - mobile only: modes + source */}
            {isMobile && (
                <div 
                    className="fixed right-4 z-50"
                    style={{
                        bottom: 'calc(1rem + env(safe-area-inset-bottom))'
                    }}
                >
                    <FloatingActionButton
                        viewMode={viewMode}
                        onViewModeChange={handleViewModeChange}
                        articleUrl={item.url}
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
        </div>
    )
}

// Memoize to prevent re-renders when parent re-renders due to orientation changes
// Only re-render if item.id or isMobile actually changes
export const FeedArticle = memo(FeedArticleComponent, (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render), false if they differ (re-render)
    return prevProps.item.id === nextProps.item.id && 
           prevProps.isMobile === nextProps.isMobile
})