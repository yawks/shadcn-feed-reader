import { ArticleToolbar, ArticleViewMode } from "./ArticleToolbar"
import { AuthRequiredError, fetchRawHtml } from "@/lib/raw-html"
import { extractDomain, getStoredAuth, storeAuth } from '@/lib/auth-storage'
import { getArticleViewMode, getArticleViewModeSync, setArticleViewMode } from '@/lib/article-view-storage'
import { memo, useEffect, useRef, useState } from "react"

import { AuthDialog } from "@/components/auth-dialog"
import { FeedItem } from "@/backends/types"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { extractArticle } from "@/lib/article-extractor"
import { safeInvoke } from '@/lib/safe-invoke'
import { useFontSize } from '@/context/font-size-context'
import { useOrientation } from '@/hooks/use-orientation'
import { useTheme } from "@/context/theme-context"

type FeedArticleProps = {
    item: FeedItem
    isMobile?: boolean
}

function FeedArticleComponent({ item, isMobile = false }: FeedArticleProps) {
    const { theme } = useTheme()
    const { fontSize } = useFontSize()
    const isLandscape = useOrientation()

    const [isLoading, setIsLoading] = useState(true)
    const [articleContent, setArticleContent] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [injectedHtml, setInjectedHtml] = useState<string | null>(null) // For direct HTML injection (original/dark modes)
    const [injectedScripts, setInjectedScripts] = useState<string[]>([]) // Inline scripts to execute separately
    const [injectedExternalScripts, setInjectedExternalScripts] = useState<string[]>([]) // External scripts (with src) to load
    const [injectedExternalStylesheets, setInjectedExternalStylesheets] = useState<string[]>([]) // External stylesheets to load
    const [isDarkMode, setIsDarkMode] = useState(false) // Track if injected HTML is in dark mode
    
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
        // Start the proxy (Tauri) if available; ignore errors in browser dev
        // try to start the tauri proxy; ignore if not available in dev
        safeInvoke("start_proxy")
            .then((port) => setProxyPort(Number(port)))
            // .catch((err) => console.debug("start_proxy not available or failed (dev):", err))
            .catch(() => {/* ignore in browser/dev */})
    }, [])


    // Use ref to track the last loaded URL to prevent unnecessary reloads
    const lastLoadedUrlRef = useRef<string | null>(null)
    const lastViewModeRef = useRef<ArticleViewMode | null>(null)
    const lastThemeRef = useRef<string | null>(null)
    const lastFontSizeRef = useRef<string | null>(null)

    useEffect(() => {
        // CRITICAL: Don't load article until viewMode is loaded (on Capacitor)
        // This prevents double loading (readability -> original/dark)
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

        const resetState = () => {
            setIsLoading(true)
            setError(null)
            setArticleContent("")
            setInjectedHtml(null)
            setInjectedScripts([])
            setInjectedExternalScripts([])
            setInjectedExternalStylesheets([])
            setIsDarkMode(false)
        }
        
        // Function to prepare HTML for Shadow DOM injection
        // With Shadow DOM, styles are automatically isolated, so we can keep them
        const prepareHtmlForShadowDom = (html: string): { html: string; scripts: string[]; externalScripts: string[]; externalStylesheets: string[] } => {
            // Create a temporary DOM to parse and prepare the HTML
            const parser = new DOMParser()
            const doc = parser.parseFromString(html, 'text/html')
            
            // Remove event handlers from elements (onclick, onload, etc.) for security
            const allElements = doc.querySelectorAll('*')
            allElements.forEach(el => {
                Array.from(el.attributes).forEach(attr => {
                    if (attr.name.startsWith('on')) {
                        el.removeAttribute(attr.name)
                    }
                })
            })
            
            // Extract scripts separately (we'll execute them manually with document proxy)
            const extractedScripts: string[] = []
            const extractedExternalScripts: string[] = []
            const extractedExternalStylesheets: string[] = []
            const allScripts = doc.querySelectorAll('script')
            allScripts.forEach(script => {
                const scriptSrc = script.getAttribute('src')
                const scriptContent = script.textContent || ''
                
                // Handle external scripts (with src attribute)
                if (scriptSrc) {
                    // Remove scripts that try to access parent window (security risk)
                    // But allow Twitter widgets and other common embeds
                    if (scriptSrc.includes('window.parent') || 
                        scriptSrc.includes('parent.postMessage') ||
                        scriptSrc.includes('top.location')) {
                        script.remove()
                        return
                    }
                    // Keep external script URLs for loading
                    extractedExternalScripts.push(scriptSrc)
                    script.remove()
                    return
                }
                
                // Handle inline scripts
                // Remove scripts that try to access parent window (security risk)
                if (scriptContent.includes('window.parent') || 
                    scriptContent.includes('parent.postMessage') ||
                    scriptContent.includes('top.location') ||
                    scriptContent.includes('window.top')) {
                    script.remove()
                    return
                }
                
                // Keep script content for manual execution
                if (scriptContent.trim()) {
                    extractedScripts.push(scriptContent)
                }
                script.remove() // Remove from DOM so they don't execute automatically
            })
            
            // Extract external stylesheets (we'll load them in Shadow DOM for isolation)
            const allStylesheets = doc.head.querySelectorAll('link[rel="stylesheet"]')
            allStylesheets.forEach(link => {
                const href = link.getAttribute('href')
                if (href && !href.startsWith('data:') && !href.startsWith('blob:')) {
                    extractedExternalStylesheets.push(href)
                    link.remove()
                }
            })
            
            // Get inline styles from head (they'll be isolated automatically by Shadow DOM)
            const inlineStyles = Array.from(doc.head.querySelectorAll('style'))
                .map(el => el.outerHTML)
                .join('\n')
            
            // Get body content (without scripts)
            const bodyContent = doc.body?.innerHTML || ''
            
            // Combine inline styles and body content
            // External stylesheets will be loaded separately in Shadow DOM for isolation
            // Shadow DOM will automatically isolate all styles (inline and external)
            // Return HTML, inline scripts, external scripts, and external stylesheets
            return {
                html: inlineStyles + '\n' + bodyContent,
                scripts: extractedScripts,
                externalScripts: extractedExternalScripts,
                externalStylesheets: extractedExternalStylesheets
            }
        }

        const setIframeUrl = (url: string) => {
            if (iframeRef.current) iframeRef.current.src = url
        }

        const handleReadabilityView = async () => {
            if (!item.url) return
            resetState()
            try {
                // eslint-disable-next-line no-console
                console.log('[FeedArticle] handleReadabilityView START for url:', item.url)
                
                // Check if we have stored credentials and apply them proactively
                const domain = extractDomain(item.url)
                const storedCreds = getStoredAuth(domain)
                if (storedCreds) {
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] Found stored credentials for domain, applying:', domain)
                    try {
                        await safeInvoke('set_proxy_auth', { 
                            domain, 
                            username: storedCreds.username, 
                            password: storedCreds.password 
                        })
                    } catch (_tauriErr) {
                        // Try Capacitor (Android)
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const win = window as any
                            const Plugins = win?.Capacitor?.Plugins
                            if (Plugins?.RawHtml?.setProxyAuth) {
                                await Plugins.RawHtml.setProxyAuth({ 
                                    domain, 
                                    username: storedCreds.username, 
                                    password: storedCreds.password 
                                })
                            }
                        } catch (_capErr) {
                            // Ignore - will prompt if needed
                        }
                    }
                }
                
                // Fetch raw HTML and extract article content using Readability
                let html: string
                try {
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] Calling fetchRawHtml...')
                    html = await fetchRawHtml(item.url)
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] fetchRawHtml SUCCESS, html length:', html.length)
                } catch (_invokeErr: unknown) {
                    // eslint-disable-next-line no-console
                    console.error('[FeedArticle] fetchRawHtml FAILED:', _invokeErr)
                    
                    // Check if it's an auth required error
                    if (_invokeErr instanceof AuthRequiredError) {
                        // eslint-disable-next-line no-console
                        console.log('[FeedArticle] Auth required for domain:', _invokeErr.domain)
                        setAuthDialog({ domain: _invokeErr.domain })
                        setIsLoading(false)
                        return
                    }
                    
                    const msg = _invokeErr instanceof Error ? _invokeErr.message : String(_invokeErr)
                    setError(`Failed to fetch article: ${msg}`)
                    setIsLoading(false)
                    return
                }

                let summary = ''
                try {
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] Calling extractArticle...')
                    const article = extractArticle(html, { url: item.url })
                    summary = article?.content || ''
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] extractArticle SUCCESS, summary length:', summary.length)
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] Article title:', article?.title)
                    // eslint-disable-next-line no-console
                    console.log('[FeedArticle] Summary preview:', summary.substring(0, 500))
                    
                    // If summary is empty or too short, show error
                    if (!summary || summary.trim().length < 50) {
                        // eslint-disable-next-line no-console
                        console.warn('[FeedArticle] Extracted content too short, may not have worked correctly')
                        setError('Readability could not extract content from this page. Try "Original" or "Dark" mode instead.')
                        setIsLoading(false)
                        return
                    }
                } catch (_parseErr) {
                    // Parsing failed — keep the view mode so user can retry, but surface an error
                    const msg = _parseErr instanceof Error ? _parseErr.message : String(_parseErr)
                    // eslint-disable-next-line no-console
                    console.error('[FeedArticle] extractArticle FAILED:', msg)
                    setError(`Readability parse failed: ${msg}`)
                    setIsLoading(false)
                    return
                }
                setArticleContent(summary)
                // eslint-disable-next-line no-console
                console.log('[FeedArticle] setArticleContent done, creating blob HTML...')

                // Create a blob HTML document with the extracted content and safe-area padding
                // This creates an isolated scroll context (like original mode) that respects insets
                const isDark = theme === 'dark'
                const quoteLeftColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
                const bgBlockquote = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
                const subtitleColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151'; // muted
                const subtitleBorderColor = isDark ? 'rgba(255,255,255,0.04)' : '#e5e7eb';
                const hrColor = isDark ? 'rgba(255,255,255,0.06)' : '#e5e7eb';
                const linkColor = isDark ? 'rgb(96, 165, 250)' : '#0099CC';
                // Map app font size key to CSS value (keep in sync with font-size-context)
                // Readable mode gets larger base font size for better readability
                const fontSizeMap: Record<string, string> = {
                    xs: '0.825rem',    // 0.75 * 1.1
                    sm: '0.9625rem',   // 0.875 * 1.1
                    base: '1.1rem',  // 1.0 * 1.1
                    lg: '1.2375rem',   // 1.125 * 1.1
                    xl: '1.375rem',    // 1.25 * 1.1
                }
                const effectiveFontSize = fontSizeMap[fontSize] || '1.2rem'

                const blobHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <style>
        /* Base reset */
        * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: ${effectiveFontSize}; line-height: 1.6; }
    body { padding: 1rem; min-height: 100vh; overflow-y: auto; -webkit-overflow-scrolling: touch; background-color: ${isDark ? 'rgb(34, 34, 34)' : 'rgb(255, 255, 255)'}; color: ${isDark ? 'rgb(229, 229, 229)' : 'rgb(34, 34, 34)'}; }

        /* Imported reader styles (adapted) */
        h1, h2 { font-weight: 300; line-height: 130%; }
        h1 { font-size: 170%; margin-bottom: 0.1em; }
        h2 { font-size: 140%; }
        h1 span, h2 span { padding-right: 10px; }
        a { color: ${linkColor}; }
        h1 a { color: inherit; text-decoration: none; }
        img { height: auto; margin-right: 15px; margin-top: 5px; vertical-align: middle; max-width: 100%; }
        pre { white-space: pre-wrap; direction: ltr; }
        blockquote { border-left: thick solid ${quoteLeftColor}; background-color: ${bgBlockquote}; margin: 0.5em 0; padding: 0.5em; }
        p { margin: 0.8em 0; }
        p.subtitle { color: ${subtitleColor}; border-top:1px ${subtitleBorderColor}; border-bottom:1px ${subtitleBorderColor}; padding-top:2px; padding-bottom:2px; font-weight:600; }
        ul, ol { margin: 0 0 0.8em 0.6em; padding: 0 0 0 1em; }
        ul li, ol li { margin: 0 0 0.8em 0; padding: 0; }
        hr { border: 1px solid ${hrColor}; background-color: ${hrColor}; }
        strong { font-weight: 400; }
        figure { margin: 0; }
        figure img { width: 100% !important; float: none; }
        
        /* Video/iframe styles */
        video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="dailymotion"] {
            max-width: 100%;
            height: auto;
        }
        
        /* Ensure last line visible on mobile safe areas */
        body::after { content: ''; display: block; height: max(6rem, env(safe-area-inset-bottom, 1rem)); }
    </style>
    <script>
        // Ensure videos have controls and iframes have fullscreen attributes for native fullscreen
        (function() {
            function enableFullscreenForMedia(media) {
                if (media.tagName === 'IFRAME') {
                    media.setAttribute('allowfullscreen', '');
                    media.setAttribute('webkitallowfullscreen', '');
                    media.setAttribute('mozallowfullscreen', '');
                } else if (media.tagName === 'VIDEO' && !media.hasAttribute('controls')) {
                    media.setAttribute('controls', 'controls');
                }
            }
            
            function processExistingMedia() {
                document.querySelectorAll('video, iframe').forEach(enableFullscreenForMedia);
            }
            
            // Process existing and dynamically added media
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) {
                            if (node.tagName === 'VIDEO' || node.tagName === 'IFRAME') {
                                enableFullscreenForMedia(node);
                            }
                            node.querySelectorAll && node.querySelectorAll('video, iframe').forEach(enableFullscreenForMedia);
                        }
                    });
                });
            });
            
            if (document.body) {
                processExistingMedia();
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', function() {
                    processExistingMedia();
                    observer.observe(document.body, { childList: true, subtree: true });
                });
            }
        })();
    </script>
</head>
<body>
    ${summary}
</body>
</html>
`
                const blob = new Blob([blobHtml], { type: 'text/html' })
                const blobUrl = URL.createObjectURL(blob)
                // eslint-disable-next-line no-console
                console.log('[FeedArticle] Blob created, URL:', blobUrl)
                setIframeUrl(blobUrl)
                // eslint-disable-next-line no-console
                console.log('[FeedArticle] Iframe URL set, readability view complete')
            } catch (_err) {
                const msg = _err instanceof Error ? _err.message : String(_err)
                // Don't silently switch to original; surface the error so user can retry.
                // eslint-disable-next-line no-console
                console.error('[FeedArticle] handleReadabilityView FAILED:', msg)
                // eslint-disable-next-line no-console
                console.error('[FeedArticle] Full error:', _err)
                setError(`Readability fetch failed: ${msg}`)
            } finally {
                setIsLoading(false)
                // eslint-disable-next-line no-console
                console.log('[FeedArticle] handleReadabilityView END')
            }
        }

        const handleOriginalView = async () => {
            if (!item.url) return
            resetState()
            try {
                let proxyUrl: string
                
                // Try Tauri desktop proxy first
                if (proxyPort) {
                    await safeInvoke('set_proxy_url', { url: item.url })
                    proxyUrl = `http://localhost:${proxyPort}/proxy?url=${encodeURIComponent(item.url)}`
                } else {
                    // On Android/Capacitor: use the Java proxy server
                    const { startProxyServer, setProxyUrl } = await import('@/lib/raw-html')
                    const port = await startProxyServer()
                    
                    if (!port) {
                        setError('Failed to start proxy server. Use the "Source" button to open in browser.')
                        setIsLoading(false)
                        return
                    }
                    
                    await setProxyUrl(item.url)
                    proxyUrl = `http://localhost:${port}/proxy?url=${encodeURIComponent(item.url)}`
                }
                
                // Fetch HTML directly from proxy instead of using iframe
                const response = await fetch(proxyUrl)
                if (!response.ok) {
                    throw new Error(`Failed to fetch: ${response.statusText}`)
                }
                
                const html = await response.text()
                
                // Prepare HTML for Shadow DOM (keep styles and scripts, remove dangerous ones)
                const prepared = prepareHtmlForShadowDom(html)
                
                setIsDarkMode(false)
                setInjectedHtml(prepared.html)
                setInjectedScripts(prepared.scripts)
                setInjectedExternalScripts(prepared.externalScripts)
                setInjectedExternalStylesheets(prepared.externalStylesheets)
            } catch (_err) {
                setError(_err instanceof Error ? _err.message : String(_err))
            } finally {
                setIsLoading(false)
            }
        }

        const handleDarkView = async () => {
            if (!item.url) return
            resetState()
            try {
                // Dark mode = Original HTML with CSS dark filter applied
                let proxyUrl: string
                
                // Try Tauri desktop proxy first
                if (proxyPort) {
                    await safeInvoke('set_proxy_url', { url: item.url })
                    proxyUrl = `http://localhost:${proxyPort}/proxy?url=${encodeURIComponent(item.url)}`
                } else {
                    // On Android/Capacitor: use the Java proxy server
                    const { startProxyServer, setProxyUrl } = await import('@/lib/raw-html')
                    const port = await startProxyServer()
                    
                    if (!port) {
                        setError('Failed to start proxy server. Use the "Source" button to open in browser.')
                        setIsLoading(false)
                        return
                    }
                    
                    await setProxyUrl(item.url)
                    proxyUrl = `http://localhost:${port}/proxy?url=${encodeURIComponent(item.url)}`
                }
                
                // Fetch HTML directly from proxy instead of using iframe
                const response = await fetch(proxyUrl)
                if (!response.ok) {
                    throw new Error(`Failed to fetch: ${response.statusText}`)
                }
                
                const html = await response.text()
                
                // Prepare HTML for Shadow DOM (keep styles and scripts, remove dangerous ones)
                const prepared = prepareHtmlForShadowDom(html)
                
                setIsDarkMode(true)
                setInjectedHtml(prepared.html)
                setInjectedScripts(prepared.scripts)
                setInjectedExternalScripts(prepared.externalScripts)
                setInjectedExternalStylesheets(prepared.externalStylesheets)
            } catch (_err) {
                const msg = _err instanceof Error ? _err.message : String(_err)
                setError(`Dark view fetch failed: ${msg}`)
            } finally {
                setIsLoading(false)
            }
        }

        if (viewMode === "readability") {
            handleReadabilityView()
        } else if (viewMode === "original") {
            handleOriginalView()
        } else if (viewMode === 'dark') {
            handleDarkView()
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
            // eslint-disable-next-line no-console
            console.debug('[DIAG] FeedArticle: iframe loaded, viewMode=', viewMode, 'proxyPort=', proxyPort)
            if (iframe.contentWindow) {
                // Prefer the iframe's origin as the target for postMessage to avoid leaking to other origins.
                let targetOrigin = '*'
                try {
                    const src = iframe.src
                    if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
                        const u = new URL(src)
                        targetOrigin = u.origin
                    }
                } catch {
                    targetOrigin = '*'
                }

                iframe.contentWindow.postMessage(
                    {
                        action: 'SET_DARK_MODE',
                        enabled: viewMode === 'dark',
                        theme: {
                            brightness: 100,
                            contrast: 90,
                            sepia: 10,
                        },
                    },
                    targetOrigin,
                )
                
                // Check iframe document for diagnostics (same-origin only, for blob URLs in readability mode)
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document
                    if (doc) {
                        const h = doc.documentElement?.scrollHeight || doc.body?.scrollHeight
                        // eslint-disable-next-line no-console
                        console.debug('[DIAG] FeedArticle: iframe document scrollHeight (same-origin):', h)
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
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.data?.type === 'PROXY_AUTH_REQUIRED' && event.data?.domain) {
                const { domain } = event.data
                setAuthDialog({ domain })
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
        } else if (viewMode === 'dark') {
            // Reload dark view
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

    // Inject HTML into Shadow DOM when injectedHtml changes (for original/dark modes)
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
            
            // Apply dark mode filter to shadow root container if needed
            const hostElement = shadowRoot.host as HTMLElement
            // Ensure the host element has proper positioning context for fixed elements inside Shadow DOM
            hostElement.style.position = 'relative'
            hostElement.style.isolation = 'isolate' // Create a new stacking context
            if (isDarkMode) {
                hostElement.style.filter = 'invert(1) hue-rotate(180deg)'
                hostElement.style.backgroundColor = 'rgb(255, 255, 255)'
            } else {
                hostElement.style.filter = ''
                hostElement.style.backgroundColor = ''
            }
            
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
                            // eslint-disable-next-line no-console
                            console.log('[FeedArticle] External stylesheet loaded in Shadow DOM:', href)
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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                // Security: This is intentional - we're injecting proxied HTML content from trusted sources
                shadowRoot.innerHTML = injectedHtml
                
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
                // Restore original document methods
                document.getElementById = originalGetElementById
                document.querySelector = originalQuerySelector
                document.querySelectorAll = originalQuerySelectorAll
                document.getElementsByClassName = originalGetElementsByClassName
                document.getElementsByTagName = originalGetElementsByTagName
            }
        }
    }, [injectedHtml, injectedScripts, injectedExternalScripts, injectedExternalStylesheets, isDarkMode])

    // Ensure iframe viewport doesn't extend under native system UI by reducing
    // iframe height according to the native bottom inset (or CSS env() fallback).
    useEffect(() => {
        const adjustIframe = (safeInset: number) => {
            const iframe = iframeRef.current
            if (!iframe) return
            try {
                // Prefer positioning via explicit height calc so the iframe's internal
                // viewport ends above the nav bar regardless of inner document CSS.
                iframe.style.height = `calc(100% - ${safeInset}px)`
            } catch (_e) {
                // ignore
            }
        }

        // probe env(safe-area-inset-bottom) as fallback
        const probeInset = () => {
            try {
                const probe = document.createElement('div')
                probe.style.position = 'absolute'
                probe.style.left = '-9999px'
                probe.style.height = 'env(safe-area-inset-bottom, 0px)'
                document.body.appendChild(probe)
                const h = probe.offsetHeight || 0
                document.body.removeChild(probe)
                return Number(h)
            } catch (_e) {
                return 0
            }
        }

        // initial adjust based on CSS env()
        adjustIframe(probeInset())

        const handler = (ev: Event) => {
            try {
                const ce = ev as CustomEvent & { detail?: { bottom?: number } }
                const safeInset = Number(ce?.detail?.bottom) || 0
                adjustIframe(safeInset)
            } catch (_e) {
                // ignore
            }
        }

        const onResize = () => adjustIframe(probeInset())

        window.addEventListener('capacitor-window-insets', handler as EventListener)
        window.addEventListener('resize', onResize)
        window.addEventListener('orientationchange', onResize)
        return () => {
            window.removeEventListener('capacitor-window-insets', handler as EventListener)
            window.removeEventListener('resize', onResize)
            window.removeEventListener('orientationchange', onResize)
        }
    }, [])

    const handleViewModeChange = async (mode: ArticleViewMode) => {
        // eslint-disable-next-line no-console
        console.log(`[FeedArticle] handleViewModeChange called: ${mode}`)
        
        // Dark mode = original view with DarkReader
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
                <div className="flex items-center justify-between p-2 h-12">
                    <ArticleToolbar viewMode={viewMode} onViewModeChange={handleViewModeChange} articleUrl={item.url} />
                </div>
                {/* container must NOT be the scroll host when rendering an iframe; let the iframe scroll internally */}
                <div data-article-container className="relative h-full w-full">
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
                                    }}>Réessayer</button>
                                    <button className="px-3 py-1 rounded border" onClick={() => setViewMode('original')}>Voir original</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {!error && (
                        viewMode === 'readability' ? (
                            <iframe
                                key={`${item.id}-${item.url}`}
                                ref={iframeRef}
                                className={cn("block h-full w-full", {
                                    invisible: isLoading,
                                })}
                                src="about:blank"
                                title="Feed article"
                                sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-top-navigation-by-user-activation"
                                allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share"
                                allowFullScreen
                                style={{ border: 0 }}
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
                                    isolation: 'isolate'
                                }}
                            />
                        )
                    )}
                </div>
            </div>
            
            {/* Auth Dialog */}
            {authDialog && (
                <AuthDialog
                    open={true}
                    domain={authDialog.domain}
                    onSubmit={handleAuthSubmit}
                    onCancel={handleAuthCancel}
                />
            )}
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