import { AuthRequiredError, fetchRawHtml } from "@/lib/raw-html"
import i18n from '@/i18n'
import { extractDomain, getStoredAuth } from '@/lib/auth-storage'
import { extractArticle, convertYouTubePlaceholders } from "@/lib/article-extractor"
import { safeInvoke } from '@/lib/safe-invoke'
import { getIframeZoomScript } from './article-zoom-scripts'
import type { SelectorItem, FeedAuthConfig } from './selector-config-types'
import { getSelectorConfig, getAuthConfig } from '@/lib/selector-config-storage'
import { transformTweetEmbeds, getTwitterWidgetScript, hasTweetEmbeds } from '@/lib/tweet-embed'
import { fixLazyLoadedImages } from '@/lib/lazy-image-fix'
import { Capacitor } from '@capacitor/core'

interface ReadabilityViewParams {
    url: string
    proxyPort: number | null
    theme: string
    fontSize: string
    setArticleContent: (content: string) => void
    setError: (error: string | null) => void
    setIsLoading: (loading: boolean) => void
    setAuthDialog: (dialog: { domain: string } | null) => void
    setIframeUrl: (url: string) => void
}

export async function handleReadabilityView({
    url,
    proxyPort,
    theme,
    fontSize,
    setArticleContent,
    setError,
    setIsLoading,
    setAuthDialog,
    setIframeUrl,
}: ReadabilityViewParams): Promise<void> {
    try {
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] handleReadabilityView START for url:', url)
        
        // Check if we have stored credentials and apply them proactively
        const domain = extractDomain(url)
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
            html = await fetchRawHtml(url)
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
            setError(i18n.t('errors.fetch_failed', { message: msg }))
            setIsLoading(false)
            return
        }

        let summary = ''
        try {
            const article = extractArticle(html, { url })
            summary = article?.content || ''
            
            // If summary is empty or too short, show error
            if (!summary || summary.trim().length < 50) {
                // eslint-disable-next-line no-console
                console.warn('[FeedArticle] Extracted content too short, may not have worked correctly')
                setError(i18n.t('errors.readability_failed'))
                setIsLoading(false)
                return
            }
        } catch (_parseErr) {
            // Parsing failed — keep the view mode so user can retry, but surface an error
            const msg = _parseErr instanceof Error ? _parseErr.message : String(_parseErr)
            // eslint-disable-next-line no-console
            console.error('[FeedArticle] extractArticle FAILED:', msg)
            setError(i18n.t('errors.parse_failed', { message: msg }))
            setIsLoading(false)
            return
        }
        
        // On Android/Capacitor: use proxy port if available, otherwise try to start it
        // Note: proxy should already be started in FeedArticle useEffect, but we handle it here as fallback
        let javaProxyPort: number | null = null
        if (!proxyPort) {
            try {
                const { startProxyServer, setProxyUrl } = await import('@/lib/raw-html')
                const port = await startProxyServer()
                if (port) {
                    javaProxyPort = port
                    await setProxyUrl(url)
                    // eslint-disable-next-line no-console
                    console.log('[handleReadabilityView] Capacitor proxy started on port (fallback):', port)
                }
            } catch (_capErr) {
                // Ignore - proxy might not be available or already running
                // eslint-disable-next-line no-console
                console.debug('[handleReadabilityView] Capacitor proxy not available or already running')
            }
        }
        
        // Fix lazy-loaded images by copying data-src to src
        let rewrittenSummary = fixLazyLoadedImages(summary)

        // Rewrite image URLs to go through proxy to avoid hotlinking issues
        // This ensures images from CDNs that check Referer headers will work
        const effectiveProxyPort = proxyPort || javaProxyPort

        // Detect Web Mode (no Tauri, no Capacitor)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isWeb = typeof window !== 'undefined' &&
                      !(window as any).__TAURI_INTERNALS__ &&
                      !(window as any).__TAURI__ &&
                      !Capacitor.isNativePlatform();

        // In web mode, set the proxy URL so the server knows the Referer to use
        if (isWeb) {
            try {
                await safeInvoke('set_proxy_url', { url })
                // eslint-disable-next-line no-console
                console.log('[handleReadabilityView] Set proxy URL for Referer:', url)
            } catch (_err) {
                // eslint-disable-next-line no-console
                console.warn('[handleReadabilityView] Failed to set proxy URL:', _err)
            }
        }

        // Build the proxy base URL - must be absolute for blob iframes
        const webProxyBase = isWeb ? window.location.origin : ''

        if (effectiveProxyPort || isWeb) {
            // Parse the HTML and rewrite all image src attributes
            const parser = new DOMParser()
            const doc = parser.parseFromString(summary, 'text/html')

            // Rewrite all img src attributes
            doc.querySelectorAll('img').forEach((img) => {
                const src = img.getAttribute('src')
                if (src &&
                    !src.startsWith('data:') &&
                    !src.startsWith('blob:') &&
                    !src.startsWith('http://localhost:') &&
                    (src.startsWith('http://') || src.startsWith('https://'))) {
                    const proxyUrl = effectiveProxyPort
                        ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(src)}`
                        : `${webProxyBase}/proxy?url=${encodeURIComponent(src)}`
                    img.setAttribute('src', proxyUrl)
                }
            })

            // Rewrite srcset attributes
            doc.querySelectorAll('img[srcset]').forEach((img) => {
                const srcset = img.getAttribute('srcset')
                if (srcset) {
                    const rewrittenSrcset = srcset.split(',').map(entry => {
                        const parts = entry.trim().split(/\s+/)
                        const imgUrl = parts[0]
                        if (imgUrl &&
                            !imgUrl.startsWith('data:') &&
                            !imgUrl.startsWith('blob:') &&
                            !imgUrl.startsWith('http://localhost:') &&
                            (imgUrl.startsWith('http://') || imgUrl.startsWith('https://'))) {
                            const proxyUrl = effectiveProxyPort
                                ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(imgUrl)}`
                                : `${webProxyBase}/proxy?url=${encodeURIComponent(imgUrl)}`
                            return proxyUrl + (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '')
                        }
                        return entry.trim()
                    }).join(', ')
                    img.setAttribute('srcset', rewrittenSrcset)
                }
            })
            
            rewrittenSummary = doc.body.innerHTML
        }

        // Transform tweet embeds (divs with data-tweetid)
        const containsTweets = hasTweetEmbeds(summary) // Check original content before transform
        rewrittenSummary = transformTweetEmbeds(rewrittenSummary)

        setArticleContent(rewrittenSummary)
        
        // Log the content that will be injected
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] Summary length:', rewrittenSummary.length);
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] Summary preview (first 500 chars):', rewrittenSummary.substring(0, 500));

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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
    <meta http-equiv="Permissions-Policy" content="accelerometer=*, gyroscope=*, magnetometer=*">
    <script>
        ${getIframeZoomScript()}
    </script>
    <style>
        /* Base reset */
        * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: ${effectiveFontSize}; line-height: 1.6; touch-action: pan-x pan-y pinch-zoom; }
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

        /* Twitter embed styles */
        blockquote.twitter-tweet {
            border-left: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 1em 0 !important;
        }
        .twitter-tweet-rendered {
            margin: 1em auto !important;
        }

        /* Ensure last line visible on mobile safe areas */
        body::after { content: ''; display: block; height: 0; }
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
        
        // Handle long press on images for Android
        (function() {
            var longPressDelay = 500; // 500ms for long press
            
            function handleImageLongPress(img) {
                var imageUrl = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
                if (imageUrl) {
                    // Send message to parent window
                    if (window.parent) {
                        window.parent.postMessage({
                            type: 'IMAGE_LONG_PRESS',
                            imageUrl: imageUrl
                        }, '*');
                    }
                }
            }
            
            function setupImageListeners(img) {
                // Prevent default context menu
                img.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    handleImageLongPress(img);
                });
                
                // Touch events for mobile
                var touchStartTime = null;
                img.addEventListener('touchstart', function(e) {
                    touchStartTime = Date.now();
                });
                
                img.addEventListener('touchend', function(e) {
                    if (touchStartTime && Date.now() - touchStartTime >= longPressDelay) {
                        e.preventDefault();
                        handleImageLongPress(img);
                    }
                    touchStartTime = null;
                });
                
                img.addEventListener('touchmove', function() {
                    touchStartTime = null;
                });
            }
            
            function processImages() {
                document.querySelectorAll('img').forEach(setupImageListeners);
            }
            
            if (document.body) {
                processImages();
                var imageObserver = new MutationObserver(function() {
                    processImages();
                });
                imageObserver.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', function() {
                    processImages();
                    var imageObserver = new MutationObserver(function() {
                        processImages();
                    });
                    imageObserver.observe(document.body, { childList: true, subtree: true });
                });
            }
        })();

        // Handle YouTube video clicks - open in parent modal
        (function() {
            function handleYouTubeClick(container) {
                var videoId = container.dataset.videoId;
                var videoTitle = container.dataset.videoTitle || '';
                if (videoId && window.parent) {
                    window.parent.postMessage({
                        type: 'YOUTUBE_VIDEO_CLICK',
                        videoId: videoId,
                        videoTitle: videoTitle
                    }, '*');
                }
            }

            function setupYouTubeListeners() {
                document.querySelectorAll('.youtube-video-link').forEach(function(container) {
                    if (container.dataset.youtubeListenerAdded) return;
                    container.dataset.youtubeListenerAdded = 'true';
                    container.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleYouTubeClick(container);
                    });
                });
            }

            if (document.body) {
                setupYouTubeListeners();
                var ytObserver = new MutationObserver(setupYouTubeListeners);
                ytObserver.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', function() {
                    setupYouTubeListeners();
                    var ytObserver = new MutationObserver(setupYouTubeListeners);
                    ytObserver.observe(document.body, { childList: true, subtree: true });
                });
            }
        })();
    </script>
</head>
<body>
    ${rewrittenSummary}
    ${containsTweets ? getTwitterWidgetScript(isDark ? 'dark' : 'light') : ''}
</body>
</html>
`
        const blob = new Blob([blobHtml], { type: 'text/html' })
        const blobUrl = URL.createObjectURL(blob)
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] Blob created, URL:', blobUrl);
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] Blob HTML length:', blobHtml.length);
        // eslint-disable-next-line no-console
        console.log('[FeedArticle] Blob HTML preview (first 1000 chars):', blobHtml.substring(0, 1000));
        setIframeUrl(blobUrl)
    } catch (_err) {
        const msg = _err instanceof Error ? _err.message : String(_err)
        // Don't silently switch to original; surface the error so user can retry.
        // eslint-disable-next-line no-console
        console.error('[FeedArticle] handleReadabilityView FAILED:', msg)
        // eslint-disable-next-line no-console
        console.error('[FeedArticle] Full error:', _err)
        setError(i18n.t('errors.parse_failed', { message: msg })) // Using parse_failed as generic fetch failed here for readability specific
    } finally {
        setIsLoading(false)
    }
}

interface OriginalViewParams {
    url: string
    proxyPort: number | null
    setInjectedHtml: (html: string) => void
    setInjectedScripts: (scripts: string[]) => void
    setInjectedExternalScripts: (scripts: string[]) => void
    setInjectedExternalStylesheets: (stylesheets: string[]) => void
    setError: (error: string | null) => void
    setIsLoading: (loading: boolean) => void
    prepareHtmlForShadowDom: (html: string) => { html: string; scripts: string[]; externalScripts: string[]; externalStylesheets: string[] }
}

export async function handleOriginalView({
    url,
    proxyPort,
    setInjectedHtml,
    setInjectedScripts,
    setInjectedExternalScripts,
    setInjectedExternalStylesheets,
    setError,
    setIsLoading,
    prepareHtmlForShadowDom,
}: OriginalViewParams): Promise<void> {
    try {
        // eslint-disable-next-line no-console
        console.log('[handleOriginalView] START, proxyPort:', proxyPort, 'url:', url)
        let proxyUrl: string
        let effectiveProxyPort = proxyPort
        
        // Detect Web Mode (no Tauri, no Capacitor)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isWeb = typeof window !== 'undefined' && 
                      !(window as any).__TAURI_INTERNALS__ && 
                      !(window as any).__TAURI__ &&
                      !Capacitor.isNativePlatform();
        
        // If proxyPort is not set and we are NOT in web mode, try to start it
        if (!effectiveProxyPort && !isWeb) {
            // eslint-disable-next-line no-console
            console.log('[handleOriginalView] proxyPort is null, attempting to start proxy...')

            // On Capacitor/Android, use the Capacitor plugin directly (not safeInvoke/HTTP API)
            if (Capacitor.isNativePlatform()) {
                try {
                    const { startProxyServer, setProxyUrl } = await import('@/lib/raw-html')
                    // eslint-disable-next-line no-console
                    console.log('[handleOriginalView] Capacitor platform detected, starting proxy...')
                    const port = await startProxyServer()

                    if (!port) {
                        // eslint-disable-next-line no-console
                        console.error('[handleOriginalView] Capacitor proxy returned null port')
                        setError(i18n.t('errors.proxy_failed'))
                        setIsLoading(false)
                        return
                    }

                    effectiveProxyPort = port
                    await setProxyUrl(url)
                    // eslint-disable-next-line no-console
                    console.log('[handleOriginalView] Capacitor proxy started on port:', effectiveProxyPort)
                } catch (capErr) {
                    // eslint-disable-next-line no-console
                    console.error('[handleOriginalView] Failed to start Capacitor proxy:', capErr)
                    const errorMsg = capErr instanceof Error ? capErr.message : String(capErr)
                    setError(i18n.t('errors.proxy_failed_with_msg', { message: errorMsg }))
                    setIsLoading(false)
                    return
                }
            } else {
                // Desktop/Docker: try Tauri or HTTP API
                try {
                    const port = await safeInvoke('start_proxy')
                    if (port && typeof port === 'number' && !isNaN(port)) {
                        effectiveProxyPort = port
                        // eslint-disable-next-line no-console
                        console.log('[handleOriginalView] Proxy started on port:', effectiveProxyPort)
                    }
                } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('[handleOriginalView] Proxy start failed:', err)
                    const errorMsg = err instanceof Error ? err.message : String(err)
                    setError(i18n.t('errors.proxy_failed_with_msg', { message: errorMsg }))
                    setIsLoading(false)
                    return
                }
            }
        }
        
        // Now we should have a proxy port, set the URL and build proxy URL
        if (effectiveProxyPort) {
            // Try to set proxy URL for Tauri (will fail silently if not Tauri)
            try {
                await safeInvoke('set_proxy_url', { url })
            } catch (_tauriErr) {
                // Not Tauri or failed, continue anyway
            }
            proxyUrl = `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(url)}`
        } else if (isWeb) {
            // Web mode fallback - use relative path
            // eslint-disable-next-line no-console
            console.log('[handleOriginalView] Web mode detected, using relative proxy path')
            proxyUrl = `/proxy?url=${encodeURIComponent(url)}`
        } else {
            // This should not happen, but handle it gracefully
            throw new Error('Proxy server not available')
        }
        
        // Fetch HTML directly from proxy instead of using iframe
        const response = await fetch(proxyUrl)
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`)
        }
        
        const html = await response.text()
        
        // Prepare HTML for Shadow DOM (keep styles and scripts, remove dangerous ones)
        const prepared = prepareHtmlForShadowDom(html)
        
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

/**
 * Apply CSS selectors to extract/filter content from raw HTML
 */
function applySelectorConfig(html: string, selectors: SelectorItem[]): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Process selectors in order
    let resultElements: Element[] = []

    for (const sel of selectors) {
        try {
            if (sel.operation === '+') {
                // Include: extract matching elements and add to result
                const matches = doc.querySelectorAll(sel.selector)
                matches.forEach(el => {
                    // Clone to avoid issues when element is already in result
                    const clone = el.cloneNode(true) as Element
                    resultElements.push(clone)
                })
            } else {
                // Exclude: remove matching elements from current result
                resultElements = resultElements.filter(resultEl => {
                    // Check if resultEl matches the selector
                    if (resultEl.matches(sel.selector)) return false

                    // Also remove matching children from within result elements
                    const childMatches = resultEl.querySelectorAll(sel.selector)
                    childMatches.forEach(child => child.remove())

                    return true
                })
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`[applySelectorConfig] Invalid selector "${sel.selector}":`, err)
            // Continue with other selectors
        }
    }

    // Build final HTML from result elements
    const resultDoc = parser.parseFromString('<div></div>', 'text/html')
    const container = resultDoc.body.firstChild as Element

    resultElements.forEach(el => {
        container.appendChild(el.cloneNode(true))
    })

    return container.innerHTML
}

/**
 * Result from fetching login page - includes field values and form action URL
 */
interface LoginPageData {
    fieldValues: Map<string, string>
    formAction: string | null
}

/**
 * Fetch dynamic field values (like CSRF tokens) from the login page
 * Also extracts the form's action URL for POST
 */
async function fetchDynamicFieldValues(
    loginUrl: string,
    fieldNames: string[]
): Promise<LoginPageData> {
    const result: LoginPageData = {
        fieldValues: new Map<string, string>(),
        formAction: null
    }

    // eslint-disable-next-line no-console
    console.log('%c[AUTH]    └─ Fetching login page to extract form data', 'color: #22c55e')

    try {
        // Fetch login page HTML
        const html = await fetchRawHtml(loginUrl)

        // Parse HTML and extract form field values
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        // Find the login form - look for form containing password field
        const forms = doc.querySelectorAll('form')
        let loginForm: Element | null = null
        for (const form of forms) {
            if (form.querySelector('input[type="password"]')) {
                loginForm = form
                break
            }
        }

        // Extract form action URL
        if (loginForm) {
            const action = loginForm.getAttribute('action')
            if (action) {
                // Resolve relative URLs against the login page URL
                try {
                    const actionUrl = new URL(action, loginUrl)
                    result.formAction = actionUrl.href
                    // eslint-disable-next-line no-console
                    console.log('%c[AUTH]       └─ Form action URL:', 'color: #22c55e', result.formAction)
                } catch {
                    // If URL parsing fails, use the action as-is if it's absolute
                    if (action.startsWith('http')) {
                        result.formAction = action
                        // eslint-disable-next-line no-console
                        console.log('%c[AUTH]       └─ Form action URL (raw):', 'color: #22c55e', result.formAction)
                    }
                }
            } else {
                // eslint-disable-next-line no-console
                console.log('%c[AUTH]       └─ No form action attribute, will POST to page URL', 'color: #eab308')
            }
        } else {
            // eslint-disable-next-line no-console
            console.warn('%c[AUTH]       └─ Could not find login form with password field', 'color: #eab308')
        }

        // Extract field values
        if (fieldNames.length > 0) {
            // eslint-disable-next-line no-console
            console.log('%c[AUTH]       └─ Looking for dynamic fields:', 'color: #22c55e', fieldNames.join(', '))
        }

        for (const fieldName of fieldNames) {
            // Try to find input with this name
            const input = doc.querySelector(
                `input[name="${fieldName}"], textarea[name="${fieldName}"], select[name="${fieldName}"]`
            ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
            if (input) {
                const value = input.value || input.getAttribute('value') || ''
                result.fieldValues.set(fieldName, value)
                // eslint-disable-next-line no-console
                console.log('%c[AUTH]       └─ Found "' + fieldName + '":', 'color: #22c55e', value ? '[value found]' : '(empty)')
            } else {
                // eslint-disable-next-line no-console
                console.warn('%c[AUTH]       └─ Field "' + fieldName + '" not found in form', 'color: #eab308')
            }
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('%c[AUTH]    └─ Error fetching dynamic values:', 'color: #ef4444', err)
    }

    return result
}

/**
 * Perform form-based login using the auth config
 * Returns true if login was successful (or no login needed), false otherwise
 */
async function performAuthLogin(authConfig: FeedAuthConfig): Promise<boolean> {
    // eslint-disable-next-line no-console
    console.log('%c[AUTH] 🔐 STEP 1: LOGIN', 'color: #22c55e; font-weight: bold; font-size: 12px')
    // eslint-disable-next-line no-console
    console.log('%c[AUTH]    └─ Page URL:', 'color: #22c55e', authConfig.loginUrl)
    // eslint-disable-next-line no-console
    console.log('%c[AUTH]    └─ User:', 'color: #22c55e', authConfig.username)

    // Find fields that need dynamic values (empty value) - typically CSRF tokens
    const dynamicFieldNames = (authConfig.extraFields || [])
        .filter(f => f.name.trim() && !f.value.trim())
        .map(f => f.name.trim())

    // Fetch login page to get dynamic values (e.g., CSRF tokens) and form action URL
    // We always fetch the page to get the form action URL, even if no dynamic fields
    const loginPageData = await fetchDynamicFieldValues(authConfig.loginUrl, dynamicFieldNames)
    const dynamicValues = loginPageData.fieldValues

    // Use the extracted form action URL, or fall back to the login page URL
    const postUrl = loginPageData.formAction || authConfig.loginUrl
    // eslint-disable-next-line no-console
    console.log('%c[AUTH]    └─ POST URL:', 'color: #22c55e', postUrl)

    // Build final fields list, replacing empty values with dynamic ones
    const resolvedExtraFields = (authConfig.extraFields || [])
        .filter(f => f.name.trim())
        .map(f => ({
            name: f.name.trim(),
            value: f.value.trim() || dynamicValues.get(f.name.trim()) || ''
        }))

    const fields = [
        { name: authConfig.usernameField, value: authConfig.username },
        { name: authConfig.passwordField, value: authConfig.password },
        ...resolvedExtraFields
    ]

    // eslint-disable-next-line no-console
    console.log('%c[AUTH]    └─ Fields:', 'color: #22c55e', fields.map(f => f.name).join(', '))

    // Try Capacitor first (Android native)
    if (Capacitor.isNativePlatform()) {
        try {
            const { performFormLogin } = await import('@/lib/raw-html')
            const result = await performFormLogin({
                loginUrl: postUrl,
                fields,
                responseSelector: authConfig.responseSelector,
            })

            if (result?.success) {
                // eslint-disable-next-line no-console
                console.log('%c[AUTH]    ✅ Login successful (Capacitor)', 'color: #22c55e; font-weight: bold')
                return true
            } else {
                // eslint-disable-next-line no-console
                console.warn('%c[AUTH]    ⚠️ Login failed (Capacitor):', 'color: #eab308', result?.message)
                return false
            }
        } catch (capErr) {
            // eslint-disable-next-line no-console
            console.warn('%c[AUTH]    Capacitor failed, trying safeInvoke:', 'color: #eab308', capErr)
        }
    }

    // Try Tauri (desktop) or HTTP API (Docker/Web mode) via safeInvoke
    try {
        const result = await safeInvoke('perform_form_login', {
            request: {
                login_url: postUrl,
                fields,
                response_selector: authConfig.responseSelector,
            },
        }) as { success?: boolean; message?: string }

        if (result?.success) {
            // eslint-disable-next-line no-console
            console.log('%c[AUTH]    ✅ Login successful (Tauri/HTTP)', 'color: #22c55e; font-weight: bold')
            return true
        } else {
            // eslint-disable-next-line no-console
            console.warn('%c[AUTH]    ⚠️ Login failed:', 'color: #eab308', result?.message)
            return false
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('%c[AUTH]    ❌ Login error:', 'color: #ef4444', err)
        return false
    }
}

/**
 * Perform logout by calling the logout URL (GET request)
 */
async function performAuthLogout(logoutUrl: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('%c[AUTH] 🚪 STEP 3: LOGOUT', 'color: #f97316; font-weight: bold; font-size: 12px')
    // eslint-disable-next-line no-console
    console.log('%c[AUTH]    └─ URL:', 'color: #f97316', logoutUrl)

    // Try Capacitor first (Android native)
    if (Capacitor.isNativePlatform()) {
        try {
            await fetchRawHtml(logoutUrl)
            // eslint-disable-next-line no-console
            console.log('%c[AUTH]    ✅ Logout successful (Capacitor)', 'color: #22c55e; font-weight: bold')
            return
        } catch (capErr) {
            // eslint-disable-next-line no-console
            console.warn('%c[AUTH]    Capacitor failed, trying safeInvoke:', 'color: #eab308', capErr)
        }
    }

    // Try Tauri (desktop) or HTTP API (Docker/Web mode) via safeInvoke
    try {
        await safeInvoke('fetch_raw_html', { url: logoutUrl })
        // eslint-disable-next-line no-console
        console.log('%c[AUTH]    ✅ Logout successful (Tauri/HTTP)', 'color: #22c55e; font-weight: bold')
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('%c[AUTH]    ⚠️ Logout failed (ignored):', 'color: #eab308', err)
    }
}

interface ConfiguredViewParams {
    url: string
    proxyPort: number | null
    feedId: string
    theme: string
    fontSize: string
    setArticleContent: (content: string) => void
    setError: (error: string | null) => void
    setIsLoading: (loading: boolean) => void
    setAuthDialog: (dialog: { domain: string } | null) => void
    setIframeUrl: (url: string) => void
}

export async function handleConfiguredView({
    url,
    proxyPort,
    feedId,
    theme,
    fontSize,
    setArticleContent,
    setError,
    setIsLoading,
    setAuthDialog,
    setIframeUrl,
}: ConfiguredViewParams): Promise<void> {
    // Track auth config for logout at the end
    let authConfig: FeedAuthConfig | null = null

    try {
        // eslint-disable-next-line no-console
        console.log('%c[AUTH] ═══════════════════════════════════════════════════════', 'color: #3b82f6')
        // eslint-disable-next-line no-console
        console.log('%c[AUTH] 📰 CONFIGURED VIEW - Article fetch with authentication', 'color: #3b82f6; font-weight: bold; font-size: 14px')
        // eslint-disable-next-line no-console
        console.log('%c[AUTH]    URL:', 'color: #3b82f6', url)
        // eslint-disable-next-line no-console
        console.log('%c[AUTH]    Feed ID:', 'color: #3b82f6', feedId)
        // eslint-disable-next-line no-console
        console.log('%c[AUTH] ═══════════════════════════════════════════════════════', 'color: #3b82f6')

        // 1. Load selector config for this feed
        const config = await getSelectorConfig(feedId)

        if (!config || (config.selectors.length === 0 && !config.customCss)) {
            setError(i18n.t('errors.no_selector_config'))
            setIsLoading(false)
            return
        }

        // 2. Load auth config and perform login if configured
        authConfig = await getAuthConfig(feedId)
        if (authConfig) {
            // eslint-disable-next-line no-console
            console.log('%c[AUTH] 🔑 Auth config found - will perform login/fetch/logout cycle', 'color: #8b5cf6; font-weight: bold')
            if (authConfig.logoutUrl) {
                // eslint-disable-next-line no-console
                console.log('%c[AUTH]    └─ Logout URL configured:', 'color: #8b5cf6', authConfig.logoutUrl)
            }
            const loginSuccess = await performAuthLogin(authConfig)
            if (!loginSuccess) {
                // eslint-disable-next-line no-console
                console.warn('%c[AUTH]    ⚠️ Login failed, continuing anyway...', 'color: #eab308')
            }
        } else {
            // eslint-disable-next-line no-console
            console.log('%c[AUTH] ℹ️ No auth config - fetching without authentication', 'color: #6b7280')
        }

        // 3. Check if we have stored credentials and apply them proactively (for HTTP Basic Auth)
        const domain = extractDomain(url)
        const storedCreds = getStoredAuth(domain)
        if (storedCreds) {
            // eslint-disable-next-line no-console
            console.log('%c[AUTH]    └─ HTTP Basic Auth credentials found for domain:', 'color: #8b5cf6', domain)
            try {
                await safeInvoke('set_proxy_auth', {
                    domain,
                    username: storedCreds.username,
                    password: storedCreds.password
                })
            } catch (_tauriErr) {
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

        // 4. Fetch raw HTML
        // eslint-disable-next-line no-console
        console.log('%c[AUTH] 📥 STEP 2: FETCH ARTICLE', 'color: #3b82f6; font-weight: bold; font-size: 12px')
        // eslint-disable-next-line no-console
        console.log('%c[AUTH]    └─ URL:', 'color: #3b82f6', url)

        let html: string
        try {
            html = await fetchRawHtml(url)
            // eslint-disable-next-line no-console
            console.log('%c[AUTH]    ✅ Fetch successful (' + html.length + ' bytes)', 'color: #22c55e; font-weight: bold')
        } catch (_invokeErr: unknown) {
            if (_invokeErr instanceof AuthRequiredError) {
                // eslint-disable-next-line no-console
                console.error('%c[AUTH]    ❌ Auth required for domain:', 'color: #ef4444', _invokeErr.domain)
                setAuthDialog({ domain: _invokeErr.domain })
                setIsLoading(false)
                return
            }

            const msg = _invokeErr instanceof Error ? _invokeErr.message : String(_invokeErr)
            // eslint-disable-next-line no-console
            console.error('%c[AUTH]    ❌ Fetch failed:', 'color: #ef4444', msg)
            setError(i18n.t('errors.fetch_failed', { message: msg }))
            setIsLoading(false)
            return
        }

        // 4. Apply selector config (or use full body if only custom CSS is configured)
        let extractedContent: string
        if (config.selectors.length > 0) {
            extractedContent = applySelectorConfig(html, config.selectors)
            if (!extractedContent || extractedContent.trim().length < 50) {
                setError(i18n.t('errors.selectors_no_content'))
                setIsLoading(false)
                return
            }
        } else {
            // No selectors, only custom CSS - use full body
            const parser = new DOMParser()
            const doc = parser.parseFromString(html, 'text/html')
            extractedContent = doc.body.innerHTML
        }

        // 5. Convert YouTube placeholders to iframes and fix lazy-loaded images
        const parser = new DOMParser()
        const contentDoc = parser.parseFromString(extractedContent, 'text/html')
        convertYouTubePlaceholders(contentDoc)
        extractedContent = contentDoc.body.innerHTML

        let rewrittenContent = fixLazyLoadedImages(extractedContent)

        // On Android/Capacitor: use proxy port if available
        let javaProxyPort: number | null = null
        if (!proxyPort) {
            try {
                const { startProxyServer, setProxyUrl } = await import('@/lib/raw-html')
                const port = await startProxyServer()
                if (port) {
                    javaProxyPort = port
                    await setProxyUrl(url)
                }
            } catch (_capErr) {
                // Ignore
            }
        }

        const effectiveProxyPort = proxyPort || javaProxyPort

        // Detect Web Mode (no Tauri, no Capacitor)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isWeb = typeof window !== 'undefined' &&
                      !(window as any).__TAURI_INTERNALS__ &&
                      !(window as any).__TAURI__ &&
                      !Capacitor.isNativePlatform();

        // In web mode, set the proxy URL so the server knows the Referer to use
        if (isWeb) {
            try {
                await safeInvoke('set_proxy_url', { url })
                // eslint-disable-next-line no-console
                console.log('[handleConfiguredView] Set proxy URL for Referer:', url)
            } catch (_err) {
                // eslint-disable-next-line no-console
                console.warn('[handleConfiguredView] Failed to set proxy URL:', _err)
            }
        }

        // Build the proxy base URL - must be absolute for blob iframes
        const webProxyBase = isWeb ? window.location.origin : ''

        if (effectiveProxyPort || isWeb) {
            const parser = new DOMParser()
            const doc = parser.parseFromString(extractedContent, 'text/html')

            // Rewrite all img src attributes
            doc.querySelectorAll('img').forEach((img) => {
                const src = img.getAttribute('src')
                if (src &&
                    !src.startsWith('data:') &&
                    !src.startsWith('blob:') &&
                    !src.startsWith('http://localhost:') &&
                    (src.startsWith('http://') || src.startsWith('https://'))) {
                    const proxyUrl = effectiveProxyPort
                        ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(src)}`
                        : `${webProxyBase}/proxy?url=${encodeURIComponent(src)}`
                    img.setAttribute('src', proxyUrl)
                }
            })

            // Rewrite srcset attributes
            doc.querySelectorAll('img[srcset]').forEach((img) => {
                const srcset = img.getAttribute('srcset')
                if (srcset) {
                    const rewrittenSrcset = srcset.split(',').map(entry => {
                        const parts = entry.trim().split(/\s+/)
                        const imgUrl = parts[0]
                        if (imgUrl &&
                            !imgUrl.startsWith('data:') &&
                            !imgUrl.startsWith('blob:') &&
                            !imgUrl.startsWith('http://localhost:') &&
                            (imgUrl.startsWith('http://') || imgUrl.startsWith('https://'))) {
                            const proxyUrl = effectiveProxyPort
                                ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(imgUrl)}`
                                : `${webProxyBase}/proxy?url=${encodeURIComponent(imgUrl)}`
                            return proxyUrl + (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '')
                        }
                        return entry.trim()
                    }).join(', ')
                    img.setAttribute('srcset', rewrittenSrcset)
                }
            })

            rewrittenContent = doc.body.innerHTML
        }

        // Transform tweet embeds (divs with data-tweetid)
        const containsTweets = hasTweetEmbeds(extractedContent) // Check before transform
        rewrittenContent = transformTweetEmbeds(rewrittenContent)

        setArticleContent(rewrittenContent)

        // 6. Create blob HTML (same structure as readability view)
        const isDark = theme === 'dark'
        const quoteLeftColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'
        const bgBlockquote = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
        const subtitleColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151'
        const subtitleBorderColor = isDark ? 'rgba(255,255,255,0.04)' : '#e5e7eb'
        const hrColor = isDark ? 'rgba(255,255,255,0.06)' : '#e5e7eb'
        const linkColor = isDark ? 'rgb(96, 165, 250)' : '#0099CC'

        const fontSizeMap: Record<string, string> = {
            xs: '0.825rem',
            sm: '0.9625rem',
            base: '1.1rem',
            lg: '1.2375rem',
            xl: '1.375rem',
        }
        const effectiveFontSize = fontSizeMap[fontSize] || '1.2rem'

        const blobHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
    <meta http-equiv="Permissions-Policy" content="accelerometer=*, gyroscope=*, magnetometer=*">
    <script>
        ${getIframeZoomScript()}

        // Handle YouTube video clicks - open in parent modal
        (function() {
            function handleYouTubeClick(container) {
                var videoId = container.dataset.videoId;
                var videoTitle = container.dataset.videoTitle || '';
                if (videoId && window.parent) {
                    window.parent.postMessage({
                        type: 'YOUTUBE_VIDEO_CLICK',
                        videoId: videoId,
                        videoTitle: videoTitle
                    }, '*');
                }
            }

            function setupYouTubeListeners() {
                document.querySelectorAll('.youtube-video-link').forEach(function(container) {
                    if (container.dataset.youtubeListenerAdded) return;
                    container.dataset.youtubeListenerAdded = 'true';
                    container.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleYouTubeClick(container);
                    });
                });
            }

            if (document.body) {
                setupYouTubeListeners();
                var ytObserver = new MutationObserver(setupYouTubeListeners);
                ytObserver.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', function() {
                    setupYouTubeListeners();
                    var ytObserver = new MutationObserver(setupYouTubeListeners);
                    ytObserver.observe(document.body, { childList: true, subtree: true });
                });
            }
        })();
    </script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: ${effectiveFontSize}; line-height: 1.6; touch-action: pan-x pan-y pinch-zoom; }
        body { padding: 1rem; min-height: 100vh; overflow-y: auto; -webkit-overflow-scrolling: touch; background-color: ${isDark ? 'rgb(34, 34, 34)' : 'rgb(255, 255, 255)'}; color: ${isDark ? 'rgb(229, 229, 229)' : 'rgb(34, 34, 34)'}; }
        h1, h2 { font-weight: 300; line-height: 130%; }
        h1 { font-size: 170%; margin-bottom: 0.1em; }
        h2 { font-size: 140%; }
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
        video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="dailymotion"] {
            max-width: 100%;
            height: auto;
        }
        /* Twitter embed styles */
        blockquote.twitter-tweet {
            border-left: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 1em 0 !important;
        }
        .twitter-tweet-rendered {
            margin: 1em auto !important;
        }
        body::after { content: ''; display: block; height: 0; }
    </style>
    ${config.customCss ? `<style id="custom-css">\n        ${config.customCss}\n    </style>` : ''}
</head>
<body>
    ${rewrittenContent}
    ${containsTweets ? getTwitterWidgetScript(isDark ? 'dark' : 'light') : ''}
</body>
</html>
`
        const blob = new Blob([blobHtml], { type: 'text/html' })
        const blobUrl = URL.createObjectURL(blob)
        setIframeUrl(blobUrl)

    } catch (_err) {
        const msg = _err instanceof Error ? _err.message : String(_err)
        // eslint-disable-next-line no-console
        console.error('%c[AUTH]    ❌ Error:', 'color: #ef4444', msg)
        setError(`Extraction avec sélecteurs échouée: ${msg}`)
    } finally {
        // 7. Perform logout if configured (always, even on error)
        if (authConfig?.logoutUrl) {
            await performAuthLogout(authConfig.logoutUrl)
        } else if (authConfig) {
            // eslint-disable-next-line no-console
            console.log('%c[AUTH] ℹ️ No logout URL configured - session may persist', 'color: #6b7280')
        }
        // eslint-disable-next-line no-console
        console.log('%c[AUTH] ═══════════════════════════════════════════════════════', 'color: #3b82f6')
        // eslint-disable-next-line no-console
        console.log('%c[AUTH] ✨ CONFIGURED VIEW COMPLETE', 'color: #3b82f6; font-weight: bold')
        // eslint-disable-next-line no-console
        console.log('%c[AUTH] ═══════════════════════════════════════════════════════', 'color: #3b82f6')
        setIsLoading(false)
    }
}
