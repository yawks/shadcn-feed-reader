import { AuthRequiredError, fetchRawHtml } from "@/lib/raw-html"
import { extractDomain, getStoredAuth } from '@/lib/auth-storage'
import { extractArticle } from "@/lib/article-extractor"
import { safeInvoke } from '@/lib/safe-invoke'
import { getIframeZoomScript } from './article-zoom-scripts'

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
            setError(`Failed to fetch article: ${msg}`)
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
                setError('Readability could not extract content from this page. Try "Original" mode instead.')
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
        
        // On Android/Capacitor: start proxy server and set base URL
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
                // Ignore - proxy might not be available
            }
        }
        
        // Rewrite image URLs to go through proxy to avoid hotlinking issues
        // This ensures images from CDNs that check Referer headers will work
        let rewrittenSummary = summary
        const effectiveProxyPort = proxyPort || javaProxyPort
        if (effectiveProxyPort) {
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
                    const proxyUrl = `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(src)}`
                    img.setAttribute('src', proxyUrl)
                }
            })
            
            // Rewrite srcset attributes
            doc.querySelectorAll('img[srcset]').forEach((img) => {
                const srcset = img.getAttribute('srcset')
                if (srcset) {
                    const rewrittenSrcset = srcset.split(',').map(entry => {
                        const parts = entry.trim().split(/\s+/)
                        const url = parts[0]
                        if (url && 
                            !url.startsWith('data:') && 
                            !url.startsWith('blob:') && 
                            !url.startsWith('http://localhost:') &&
                            (url.startsWith('http://') || url.startsWith('https://'))) {
                            const proxyUrl = `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(url)}`
                            return proxyUrl + (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '')
                        }
                        return entry.trim()
                    }).join(', ')
                    img.setAttribute('srcset', rewrittenSrcset)
                }
            })
            
            rewrittenSummary = doc.body.innerHTML
        }
        
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
    </script>
</head>
<body>
    ${rewrittenSummary}
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
        setError(`Readability fetch failed: ${msg}`)
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
        let proxyUrl: string
        
        // Try Tauri desktop proxy first
        if (proxyPort) {
            await safeInvoke('set_proxy_url', { url })
            proxyUrl = `http://localhost:${proxyPort}/proxy?url=${encodeURIComponent(url)}`
        } else {
            // On Android/Capacitor: use the Java proxy server
            const { startProxyServer, setProxyUrl } = await import('@/lib/raw-html')
            const port = await startProxyServer()
            
            if (!port) {
                setError('Failed to start proxy server. Use the "Source" button to open in browser.')
                setIsLoading(false)
                return
            }
            
            await setProxyUrl(url)
            proxyUrl = `http://localhost:${port}/proxy?url=${encodeURIComponent(url)}`
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

