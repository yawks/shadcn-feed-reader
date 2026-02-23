import i18n from '@/i18n'
import {
  extractArticle,
  convertYouTubePlaceholders,
} from '@/lib/article-extractor'
import { extractDomain, getStoredAuth } from '@/lib/auth-storage'
import { fixLazyLoadedImages } from '@/lib/lazy-image-fix'
import { AuthRequiredError, fetchRawHtml } from '@/lib/raw-html'
import { safeInvoke } from '@/lib/safe-invoke'
import { getSelectorConfig, getAuthConfig } from '@/lib/selector-config-storage'
import {
  transformTweetEmbeds,
  getTwitterWidgetScript,
  hasTweetEmbeds,
} from '@/lib/tweet-embed'
import { getIframeZoomScript } from './article-zoom-scripts'
import type { SelectorItem, FeedAuthConfig } from './selector-config-types'

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
  /** Returns true if a newer load has started and this one should be discarded */
  isStale?: () => boolean
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
  isStale,
}: ReadabilityViewParams): Promise<void> {
  // When the iframe URL is set, the iframe load event will call setIsLoading(false).
  // Track this so the finally block doesn't release loading prematurely.
  let iframeHandlesLoading = false
  try {
    // eslint-disable-next-line no-console
    console.log('[FeedArticle] handleReadabilityView START for url:', url)

    // Check if we have stored credentials and apply them proactively
    const domain = extractDomain(url)
    const storedCreds = getStoredAuth(domain)
    if (storedCreds) {
      // eslint-disable-next-line no-console
      console.log(
        '[FeedArticle] Found stored credentials for domain, applying:',
        domain
      )
      try {
        await safeInvoke('set_proxy_auth', {
          domain,
          username: storedCreds.username,
          password: storedCreds.password,
        })
      } catch (_err) {
        // Ignore - will prompt if needed
      }
    }

    // Fetch raw HTML and extract article content using Readability
    let html: string
    try {
      html = await fetchRawHtml(url)
    } catch (_invokeErr: unknown) {
      // eslint-disable-next-line no-console
      console.error('[FeedArticle] fetchRawHtml FAILED:', _invokeErr)

      if (isStale?.()) return

      // Check if it's an auth required error
      if (_invokeErr instanceof AuthRequiredError) {
        // eslint-disable-next-line no-console
        console.log(
          '[FeedArticle] Auth required for domain:',
          _invokeErr.domain
        )
        setAuthDialog({ domain: _invokeErr.domain })
        setIsLoading(false)
        return
      }

      const msg =
        _invokeErr instanceof Error ? _invokeErr.message : String(_invokeErr)
      setError(i18n.t('errors.fetch_failed', { message: msg }))
      setIsLoading(false)
      return
    }

    if (isStale?.()) return

    let summary = ''
    try {
      const article = extractArticle(html, { url })
      summary = article?.content || ''

      // If summary is empty or too short, show error
      if (!summary || summary.trim().length < 50) {
        // eslint-disable-next-line no-console
        console.warn(
          '[FeedArticle] Extracted content too short, may not have worked correctly'
        )
        setError(i18n.t('errors.readability_failed'))
        setIsLoading(false)
        return
      }
    } catch (_parseErr) {
      // Parsing failed — keep the view mode so user can retry, but surface an error
      const msg =
        _parseErr instanceof Error ? _parseErr.message : String(_parseErr)
      // eslint-disable-next-line no-console
      console.error('[FeedArticle] extractArticle FAILED:', msg)
      setError(i18n.t('errors.parse_failed', { message: msg }))
      setIsLoading(false)
      return
    }

    // Fix lazy-loaded images by copying data-src to src
    let rewrittenSummary = fixLazyLoadedImages(summary)

    // Rewrite image URLs to go through proxy to avoid hotlinking issues
    // This ensures images from CDNs that check Referer headers will work
    const effectiveProxyPort = proxyPort

    // Detect Web Mode (no Tauri)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isWeb =
      typeof window !== 'undefined' &&
      !(window as any).__TAURI_INTERNALS__ &&
      !(window as any).__TAURI__

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

      // Helper to resolve relative URLs to absolute
      const resolveUrl = (src: string): string | null => {
        if (
          !src ||
          src.startsWith('data:') ||
          src.startsWith('blob:') ||
          src.startsWith('http://localhost:')
        ) {
          return null
        }
        // Already absolute
        if (src.startsWith('http://') || src.startsWith('https://')) {
          return src
        }
        // Resolve relative URL using article URL as base
        try {
          const resolved = new URL(src, url).href
          return resolved
        } catch {
          return null
        }
      }

      // Rewrite all img src attributes
      doc.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src')
        const absoluteSrc = resolveUrl(src || '')
        if (absoluteSrc) {
          const proxyUrl = effectiveProxyPort
            ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(absoluteSrc)}`
            : `${webProxyBase}/proxy?url=${encodeURIComponent(absoluteSrc)}`
          img.setAttribute('src', proxyUrl)
        }
      })

      // Rewrite srcset attributes
      doc.querySelectorAll('img[srcset]').forEach((img) => {
        const srcset = img.getAttribute('srcset')
        if (srcset) {
          const rewrittenSrcset = srcset
            .split(',')
            .map((entry) => {
              const parts = entry.trim().split(/\s+/)
              const imgUrl = parts[0]
              const absoluteImgUrl = resolveUrl(imgUrl || '')
              if (absoluteImgUrl) {
                const proxyUrl = effectiveProxyPort
                  ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(absoluteImgUrl)}`
                  : `${webProxyBase}/proxy?url=${encodeURIComponent(absoluteImgUrl)}`
                return (
                  proxyUrl +
                  (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '')
                )
              }
              return entry.trim()
            })
            .join(', ')
          img.setAttribute('srcset', rewrittenSrcset)
        }
      })

      // Rewrite srcset attributes on <source> elements inside <picture>
      doc.querySelectorAll('source[srcset]').forEach((source) => {
        const srcset = source.getAttribute('srcset')
        if (srcset) {
          const rewrittenSrcset = srcset
            .split(',')
            .map((entry) => {
              const parts = entry.trim().split(/\s+/)
              const imgUrl = parts[0]
              const absoluteImgUrl = resolveUrl(imgUrl || '')
              if (absoluteImgUrl) {
                const proxyUrl = effectiveProxyPort
                  ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(absoluteImgUrl)}`
                  : `${webProxyBase}/proxy?url=${encodeURIComponent(absoluteImgUrl)}`
                return (
                  proxyUrl +
                  (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '')
                )
              }
              return entry.trim()
            })
            .join(', ')
          source.setAttribute('srcset', rewrittenSrcset)
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
    console.log('[FeedArticle] Summary length:', rewrittenSummary.length)
    // eslint-disable-next-line no-console
    console.log(
      '[FeedArticle] Summary preview (first 500 chars):',
      rewrittenSummary.substring(0, 500)
    )

    // Create a blob HTML document with the extracted content and safe-area padding
    // This creates an isolated scroll context (like original mode) that respects insets
    const isDark = theme === 'dark'
    const quoteLeftColor = isDark
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(0,0,0,0.12)'
    const bgBlockquote = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
    const subtitleColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151' // muted
    const subtitleBorderColor = isDark ? 'rgba(255,255,255,0.04)' : '#e5e7eb'
    const hrColor = isDark ? 'rgba(255,255,255,0.06)' : '#e5e7eb'
    const linkColor = isDark ? 'rgb(96, 165, 250)' : '#0099CC'
    // Map app font size key to CSS value (keep in sync with font-size-context)
    // Readable mode gets larger base font size for better readability
    const fontSizeMap: Record<string, string> = {
      xs: '0.825rem', // 0.75 * 1.1
      sm: '0.9625rem', // 0.875 * 1.1
      base: '1.1rem', // 1.0 * 1.1
      lg: '1.2375rem', // 1.125 * 1.1
      xl: '1.375rem', // 1.25 * 1.1
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
    html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: ${effectiveFontSize}; line-height: 1.6; touch-action: manipulation; }
    body { padding: 1rem; min-height: 100vh; overflow-y: auto; -webkit-overflow-scrolling: touch; background-color: ${isDark ? 'rgb(34, 34, 34)' : 'rgb(255, 255, 255)'}; color: ${isDark ? 'rgb(229, 229, 229)' : 'rgb(34, 34, 34)'}; }

        /* Imported reader styles (adapted) */
        h1, h2, h3, h4 { font-weight: 600; line-height: 130%; }
        h1 { font-size: 175%; margin-top: 0.2em; margin-bottom: 0.5em; }
        h2 { font-size: 135%; margin-top: 1.6em; margin-bottom: 0.4em; }
        h3 { font-size: 115%; margin-top: 1.2em; margin-bottom: 0.3em; }
        h4 { font-size: 105%; margin-top: 1em; margin-bottom: 0.25em; }
        h1 span, h2 span { padding-right: 10px; }
        a { color: ${linkColor}; }
        h1 a { color: inherit; text-decoration: none; }
        img { height: auto; margin-right: 15px; margin-top: 5px; vertical-align: middle; max-width: 100%; }
        pre { white-space: pre-wrap; direction: ltr; }
        blockquote { border-left: thick solid ${quoteLeftColor}; background-color: ${bgBlockquote}; margin: 0.8em 0; padding: 0.6em 0.8em; }
        p { margin: 0.6em 0 0.9em; }
        p.subtitle { color: ${subtitleColor}; border-top:1px ${subtitleBorderColor}; border-bottom:1px ${subtitleBorderColor}; padding-top:2px; padding-bottom:2px; font-weight:600; }
        ul, ol { margin: 0 0 0.8em 0.6em; padding: 0 0 0 1em; }
        ul li, ol li { margin: 0 0 0.35em 0; padding: 0; }
        hr { border: 1px solid ${hrColor}; background-color: ${hrColor}; margin: 1.2em 0; }
        strong { font-weight: 700; }
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

        /* Dark theme scrollbar */
        ${
          isDark
            ? `
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.1); }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
        * { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1); }
        `
            : ''
        }
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

        // Report scroll progress to parent via postMessage (works on Android WebView)
        (function() {
            console.log('[SCROLL_PROGRESS_IFRAME] Script initialized');
            var lastProgress = -1;
            function reportScrollProgress() {
                var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
                var scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
                var clientHeight = document.documentElement.clientHeight || document.body.clientHeight;
                var maxScroll = scrollHeight - clientHeight;
                var progress = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)) : 0;
                // Only send if changed (avoid flooding)
                var rounded = Math.round(progress);
                if (rounded !== lastProgress) {
                    lastProgress = rounded;
                    console.log('[SCROLL_PROGRESS_IFRAME] Sending progress:', progress, 'parent:', !!window.parent);
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'SCROLL_PROGRESS', progress: progress }, '*');
                    }
                }
            }
            // Multiple event sources for maximum compatibility on Android WebView
            window.addEventListener('scroll', reportScrollProgress, { passive: true });
            document.addEventListener('scroll', reportScrollProgress, { passive: true });
            document.addEventListener('touchmove', reportScrollProgress, { passive: true });
            document.addEventListener('touchend', function() {
                // Delayed check after touch ends (momentum scroll)
                setTimeout(reportScrollProgress, 100);
                setTimeout(reportScrollProgress, 300);
            }, { passive: true });
            document.addEventListener('DOMContentLoaded', function() {
                console.log('[SCROLL_PROGRESS_IFRAME] DOMContentLoaded');
                reportScrollProgress();
            });
        })();

        // Handle all link clicks: anchors scroll in-page, same-domain navigates internally, cross-domain opens externally
        (function() {
            var articleUrl = decodeURIComponent('${encodeURIComponent(url)}');
            var articleHostname = '';
            try { articleHostname = new URL(articleUrl).hostname; } catch(e) {}
            var scrollStack = [];

            document.addEventListener('click', function(e) {
                var link = e.target.closest ? e.target.closest('a') : null;
                if (!link) return;
                var href = link.getAttribute('href');
                if (!href) return;

                // Anchor links: scroll within page
                if (href.charAt(0) === '#') {
                    if (href === '#') return;
                    var targetId = href.substring(1);
                    var target = document.getElementById(targetId) || document.querySelector('[name="' + CSS.escape(targetId) + '"]');
                    if (!target) return;
                    e.preventDefault();
                    var currentScroll = window.scrollY || document.documentElement.scrollTop;
                    scrollStack.push(currentScroll);
                    history.pushState({ anchorScroll: true }, '', href);
                    target.scrollIntoView({ behavior: 'smooth' });
                    return;
                }

                // Resolve relative URLs against article URL
                var resolvedUrl;
                try { resolvedUrl = new URL(href, articleUrl).href; } catch(err) { return; }

                // Skip non-http(s) protocols (mailto:, tel:, javascript:, etc.)
                if (resolvedUrl.indexOf('http') !== 0) return;

                var linkHostname;
                try { linkHostname = new URL(resolvedUrl).hostname; } catch(err) { return; }

                e.preventDefault();

                if (linkHostname === articleHostname && window.parent && window.parent !== window) {
                    // Same domain: navigate within iframe via parent
                    window.parent.postMessage({ type: 'NAVIGATE_INTERNAL', url: resolvedUrl }, '*');
                } else if (window.parent && window.parent !== window) {
                    // Different domain: open externally via parent
                    window.parent.postMessage({ type: 'OPEN_EXTERNAL', url: resolvedUrl }, '*');
                }
            });

            window.addEventListener('popstate', function() {
                if (scrollStack.length > 0) {
                    var pos = scrollStack.pop();
                    window.scrollTo({ top: pos, behavior: 'smooth' });
                }
            });
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
    console.log('[FeedArticle] Blob created, URL:', blobUrl)
    // eslint-disable-next-line no-console
    console.log('[FeedArticle] Blob HTML length:', blobHtml.length)
    // eslint-disable-next-line no-console
    console.log(
      '[FeedArticle] Blob HTML preview (first 1000 chars):',
      blobHtml.substring(0, 1000)
    )
    setIframeUrl(blobUrl)
    // The iframe load event will call setIsLoading(false) once the content is rendered
    iframeHandlesLoading = true
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    // Don't silently switch to original; surface the error so user can retry.
    // eslint-disable-next-line no-console
    console.error('[FeedArticle] handleReadabilityView FAILED:', msg)
    // eslint-disable-next-line no-console
    console.error('[FeedArticle] Full error:', _err)
    if (!isStale?.()) {
      setError(i18n.t('errors.parse_failed', { message: msg }))
    }
  } finally {
    // Only release loading here for error paths. On success, the iframe load event does it.
    if (!isStale?.() && !iframeHandlesLoading) {
      setIsLoading(false)
    }
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
  prepareHtmlForShadowDom: (html: string) => {
    html: string
    scripts: string[]
    externalScripts: string[]
    externalStylesheets: string[]
  }
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
  // When HTML is injected into the Shadow DOM, the injection useEffect calls setIsLoading(false).
  // Track this so the finally block doesn't release loading prematurely.
  let shadowDomHandlesLoading = false
  try {
    // eslint-disable-next-line no-console
    console.log(
      '[handleOriginalView] START, proxyPort:',
      proxyPort,
      'url:',
      url
    )
    let proxyUrl: string
    let effectiveProxyPort = proxyPort

    // Detect Web Mode (no Tauri)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isWeb =
      typeof window !== 'undefined' &&
      !(window as any).__TAURI_INTERNALS__ &&
      !(window as any).__TAURI__

    // If proxyPort is not set and we are NOT in web mode, try to start it
    if (!effectiveProxyPort && !isWeb) {
      // eslint-disable-next-line no-console
      console.log(
        '[handleOriginalView] proxyPort is null, attempting to start proxy...'
      )

      try {
        const port = await safeInvoke('start_proxy')
        if (port && typeof port === 'number' && !isNaN(port)) {
          effectiveProxyPort = port
          // eslint-disable-next-line no-console
          console.log(
            '[handleOriginalView] Proxy started on port:',
            effectiveProxyPort
          )
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[handleOriginalView] Proxy start failed:', err)
        const errorMsg = err instanceof Error ? err.message : String(err)
        setError(
          i18n.t('errors.proxy_failed_with_msg', { message: errorMsg })
        )
        setIsLoading(false)
        return
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
      console.log(
        '[handleOriginalView] Web mode detected, using relative proxy path'
      )
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
    // The Shadow DOM injection useEffect will call setIsLoading(false) once HTML is in the DOM
    shadowDomHandlesLoading = true
  } catch (_err) {
    setError(_err instanceof Error ? _err.message : String(_err))
  } finally {
    // Only release loading here for error paths. On success, the Shadow DOM injection does it.
    if (!shadowDomHandlesLoading) {
      setIsLoading(false)
    }
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
        matches.forEach((el) => {
          // Clone to avoid issues when element is already in result
          const clone = el.cloneNode(true) as Element
          resultElements.push(clone)
        })
      } else {
        // Exclude: remove matching elements from current result
        resultElements = resultElements.filter((resultEl) => {
          // Check if resultEl matches the selector
          if (resultEl.matches(sel.selector)) return false

          // Also remove matching children from within result elements
          const childMatches = resultEl.querySelectorAll(sel.selector)
          childMatches.forEach((child) => child.remove())

          return true
        })
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[applySelectorConfig] Invalid selector "${sel.selector}":`,
        err
      )
      // Continue with other selectors
    }
  }

  // Build final HTML from result elements
  const resultDoc = parser.parseFromString('<div></div>', 'text/html')
  const container = resultDoc.body.firstChild as Element

  resultElements.forEach((el) => {
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
    formAction: null,
  }

  // eslint-disable-next-line no-console
  console.log('[AUTH]    Fetching login page to extract form data: ' + loginUrl)

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
          console.log('[AUTH]    formAction=' + result.formAction)
        } catch {
          // If URL parsing fails, use the action as-is if it's absolute
          if (action.startsWith('http')) {
            result.formAction = action
            // eslint-disable-next-line no-console
            console.log('[AUTH]    formAction(raw)=' + result.formAction)
          }
        }
      } else {
        // eslint-disable-next-line no-console
        console.log('[AUTH]    No form action attribute, will POST to page URL')
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn('[AUTH]    Could not find login form with password field')
    }

    // Extract field values
    if (fieldNames.length > 0) {
      // eslint-disable-next-line no-console
      console.log('[AUTH]    Looking for dynamic fields: ' + fieldNames.join(', '))
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
        console.log('[AUTH]    field "' + fieldName + '": ' + (value ? 'value found' : 'empty'))
      } else {
        // eslint-disable-next-line no-console
        console.warn('[AUTH]    field "' + fieldName + '" not found in form')
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[AUTH]    Error fetching dynamic values:', err)
  }

  return result
}

/**
 * Perform form-based login using the auth config
 * Returns true if login was successful (or no login needed), false otherwise
 */
async function performAuthLogin(authConfig: FeedAuthConfig): Promise<boolean> {
  // eslint-disable-next-line no-console
  console.log('[AUTH] STEP 1: LOGIN loginUrl=' + authConfig.loginUrl + ' user=' + authConfig.username)

  // Find fields that need dynamic values (empty value) - typically CSRF tokens
  const dynamicFieldNames = (authConfig.extraFields || [])
    .filter((f) => f.name.trim() && !f.value.trim())
    .map((f) => f.name.trim())

  // Fetch login page to get dynamic values (e.g., CSRF tokens) and form action URL
  // We always fetch the page to get the form action URL, even if no dynamic fields
  const loginPageData = await fetchDynamicFieldValues(
    authConfig.loginUrl,
    dynamicFieldNames
  )
  const dynamicValues = loginPageData.fieldValues

  // Use the extracted form action URL, or fall back to the login page URL
  const postUrl = loginPageData.formAction || authConfig.loginUrl
  // eslint-disable-next-line no-console
  console.log('[AUTH]    postUrl=' + postUrl)

  // Build final fields list, replacing empty values with dynamic ones
  const resolvedExtraFields = (authConfig.extraFields || [])
    .filter((f) => f.name.trim())
    .map((f) => ({
      name: f.name.trim(),
      value: f.value.trim() || dynamicValues.get(f.name.trim()) || '',
    }))

  const fields = [
    { name: authConfig.usernameField, value: authConfig.username },
    { name: authConfig.passwordField, value: authConfig.password },
    ...resolvedExtraFields,
  ]

  // eslint-disable-next-line no-console
  console.log('[AUTH]    fields=' + fields.map((f) => f.name).join(','))

  // Try Tauri (desktop) or HTTP API (Docker/Web mode) via safeInvoke
  try {
    const result = (await safeInvoke('perform_form_login', {
      request: {
        login_url: postUrl,
        fields,
        response_selector: authConfig.responseSelector,
      },
    })) as { success?: boolean; statusCode?: number; message?: string; extractedText?: string }

    // eslint-disable-next-line no-console
    console.log(
      '[AUTH] LOGIN RESPONSE (Tauri/HTTP) - success:', result?.success,
      '| HTTP status:', result?.statusCode,
      '| message:', result?.message
    )
    if (result?.extractedText !== undefined) {
      // eslint-disable-next-line no-console
      console.log('[AUTH]    └─ responseSelector extracted:', JSON.stringify(result.extractedText).substring(0, 200))
    }

    if (result?.success) {
      // eslint-disable-next-line no-console
      console.log('[AUTH]    ✅ Login successful (Tauri/HTTP)')
      return true
    } else {
      // eslint-disable-next-line no-console
      console.warn('[AUTH]    ❌ Login failed (Tauri/HTTP) - HTTP', result?.statusCode, '-', result?.message)
      return false
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[AUTH]    ❌ Login threw error:', err)
    return false
  }
}

/**
 * Perform logout by calling the logout URL (GET request)
 */
async function performAuthLogout(logoutUrl: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[AUTH] 🚪 STEP 3: LOGOUT - URL:', logoutUrl)

  try {
    const result = await safeInvoke('fetch_raw_html', { url: logoutUrl })
    // eslint-disable-next-line no-console
    console.log('[AUTH]    ✅ Logout successful (Tauri/HTTP), response length:', String(result ?? '').length)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AUTH]    ⚠️ Logout failed (ignored):', err)
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
  /** Returns true if a newer load has started and this one should be discarded */
  isStale?: () => boolean
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
  isStale,
}: ConfiguredViewParams): Promise<void> {
  // Track auth config for logout at the end
  let authConfig: FeedAuthConfig | null = null
  // When the iframe URL is set, the iframe load event will call setIsLoading(false).
  // Track this so the finally block doesn't release loading prematurely.
  let iframeHandlesLoading = false

  try {
    // eslint-disable-next-line no-console
    console.log('[AUTH] === CONFIGURED VIEW START === feedId=' + feedId + ' url=' + url)

    // 1. Load selector config for this feed
    const config = await getSelectorConfig(feedId)

    if (!config || (config.selectors.length === 0 && !config.customCss)) {
      setError(i18n.t('errors.no_selector_config'))
      setIsLoading(false)
      return
    }

    // 2. Load auth config and perform login if configured
    authConfig = await getAuthConfig(feedId)
    // eslint-disable-next-line no-console
    console.log(
      '[AUTH] getAuthConfig(feedId=' + feedId + ') => ' +
      (authConfig ? 'AUTH_CONFIG_FOUND loginUrl=' + authConfig.loginUrl : 'AUTH_CONFIG_NULL (no authConfig saved OR no backend-password in localStorage)')
    )
    if (authConfig) {
      // eslint-disable-next-line no-console
      console.log('[AUTH] Auth config found - performing login/fetch/logout cycle')
      // eslint-disable-next-line no-console
      console.log('[AUTH]    loginUrl=' + authConfig.loginUrl)
      // eslint-disable-next-line no-console
      console.log('[AUTH]    logoutUrl=' + (authConfig.logoutUrl || '(none)'))
      const loginSuccess = await performAuthLogin(authConfig)
      // eslint-disable-next-line no-console
      console.log('[AUTH]    loginResult=' + (loginSuccess ? 'SUCCESS' : 'FAILED'))
      if (!loginSuccess) {
        // eslint-disable-next-line no-console
        console.warn('[AUTH]    Login failed, continuing fetch anyway...')
      }
    } else {
      // eslint-disable-next-line no-console
      console.log('[AUTH] No auth config for feed ' + feedId + ' - fetching without authentication')
    }

    // Abort if a newer load has started while we were logging in
    if (isStale?.()) {
      // eslint-disable-next-line no-console
      console.log('[AUTH] ⚠️ Load is stale (newer load started), aborting after login')
      return
    }

    // 3. Check if we have stored credentials and apply them proactively (for HTTP Basic Auth)
    const domain = extractDomain(url)
    const storedCreds = getStoredAuth(domain)
    if (storedCreds) {
      // eslint-disable-next-line no-console
      console.log(
        '%c[AUTH]    └─ HTTP Basic Auth credentials found for domain:',
        'color: #8b5cf6',
        domain
      )
      try {
        await safeInvoke('set_proxy_auth', {
          domain,
          username: storedCreds.username,
          password: storedCreds.password,
        })
      } catch (_err) {
        // Ignore - will prompt if needed
      }
    }

    // 4. Fetch raw HTML
    // eslint-disable-next-line no-console
    console.log('[AUTH] STEP 2: FETCH ARTICLE url=' + url)

    let html: string
    try {
      html = await fetchRawHtml(url)
      // eslint-disable-next-line no-console
      console.log('[AUTH]    ✅ Article fetch successful (' + html.length + ' bytes)')
    } catch (_invokeErr: unknown) {
      if (isStale?.()) {
        // eslint-disable-next-line no-console
        console.log('[AUTH] ⚠️ Load is stale, discarding fetch error')
        return
      }
      if (_invokeErr instanceof AuthRequiredError) {
        // eslint-disable-next-line no-console
        console.error('[AUTH]    ❌ Auth required for domain:', _invokeErr.domain)
        setAuthDialog({ domain: _invokeErr.domain })
        setIsLoading(false)
        return
      }

      const msg =
        _invokeErr instanceof Error ? _invokeErr.message : String(_invokeErr)
      // eslint-disable-next-line no-console
      console.error('[AUTH]    ❌ Fetch failed:', msg)
      setError(i18n.t('errors.fetch_failed', { message: msg }))
      setIsLoading(false)
      return
    }

    if (isStale?.()) {
      // eslint-disable-next-line no-console
      console.log('[AUTH] ⚠️ Load is stale after article fetch, aborting')
      return
    }

    // 4. Apply selector config (or use full body if only custom CSS is configured)
    let extractedContent: string
    if (config.selectors.length > 0) {
      extractedContent = applySelectorConfig(html, config.selectors)
      if (!extractedContent || extractedContent.trim().length < 50) {
        // eslint-disable-next-line no-console
        console.warn('[handleConfiguredView] Selectors returned no content (length=' + (extractedContent?.trim().length ?? 0) + '). Selectors:', config.selectors.map(s => s.operation + s.selector).join(', '))
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

    const effectiveProxyPort = proxyPort

    // Detect Web Mode (no Tauri)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isWeb =
      typeof window !== 'undefined' &&
      !(window as any).__TAURI_INTERNALS__ &&
      !(window as any).__TAURI__

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

      // Helper to resolve relative URLs to absolute
      const resolveUrl = (src: string): string | null => {
        if (
          !src ||
          src.startsWith('data:') ||
          src.startsWith('blob:') ||
          src.startsWith('http://localhost:')
        ) {
          return null
        }
        // Already absolute
        if (src.startsWith('http://') || src.startsWith('https://')) {
          return src
        }
        // Resolve relative URL using article URL as base
        try {
          const resolved = new URL(src, url).href
          return resolved
        } catch {
          return null
        }
      }

      // Rewrite all img src attributes
      doc.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src')
        const absoluteSrc = resolveUrl(src || '')
        if (absoluteSrc) {
          const proxyUrl = effectiveProxyPort
            ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(absoluteSrc)}`
            : `${webProxyBase}/proxy?url=${encodeURIComponent(absoluteSrc)}`
          img.setAttribute('src', proxyUrl)
        }
      })

      // Rewrite srcset attributes
      doc.querySelectorAll('img[srcset]').forEach((img) => {
        const srcset = img.getAttribute('srcset')
        if (srcset) {
          const rewrittenSrcset = srcset
            .split(',')
            .map((entry) => {
              const parts = entry.trim().split(/\s+/)
              const imgUrl = parts[0]
              const absoluteImgUrl = resolveUrl(imgUrl || '')
              if (absoluteImgUrl) {
                const proxyUrl = effectiveProxyPort
                  ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(absoluteImgUrl)}`
                  : `${webProxyBase}/proxy?url=${encodeURIComponent(absoluteImgUrl)}`
                return (
                  proxyUrl +
                  (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '')
                )
              }
              return entry.trim()
            })
            .join(', ')
          img.setAttribute('srcset', rewrittenSrcset)
        }
      })

      // Rewrite srcset attributes on <source> elements inside <picture>
      doc.querySelectorAll('source[srcset]').forEach((source) => {
        const srcset = source.getAttribute('srcset')
        if (srcset) {
          const rewrittenSrcset = srcset
            .split(',')
            .map((entry) => {
              const parts = entry.trim().split(/\s+/)
              const imgUrl = parts[0]
              const absoluteImgUrl = resolveUrl(imgUrl || '')
              if (absoluteImgUrl) {
                const proxyUrl = effectiveProxyPort
                  ? `http://localhost:${effectiveProxyPort}/proxy?url=${encodeURIComponent(absoluteImgUrl)}`
                  : `${webProxyBase}/proxy?url=${encodeURIComponent(absoluteImgUrl)}`
                return (
                  proxyUrl +
                  (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '')
                )
              }
              return entry.trim()
            })
            .join(', ')
          source.setAttribute('srcset', rewrittenSrcset)
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
    const quoteLeftColor = isDark
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(0,0,0,0.12)'
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

        // Report scroll progress to parent via postMessage (works on Android WebView)
        (function() {
            console.log('[SCROLL_PROGRESS_IFRAME] Script initialized (configured)');
            var lastProgress = -1;
            function reportScrollProgress() {
                var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
                var scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
                var clientHeight = document.documentElement.clientHeight || document.body.clientHeight;
                var maxScroll = scrollHeight - clientHeight;
                var progress = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)) : 0;
                // Only send if changed (avoid flooding)
                var rounded = Math.round(progress);
                if (rounded !== lastProgress) {
                    lastProgress = rounded;
                    console.log('[SCROLL_PROGRESS_IFRAME] Sending progress:', progress, 'parent:', !!window.parent);
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'SCROLL_PROGRESS', progress: progress }, '*');
                    }
                }
            }
            // Multiple event sources for maximum compatibility on Android WebView
            window.addEventListener('scroll', reportScrollProgress, { passive: true });
            document.addEventListener('scroll', reportScrollProgress, { passive: true });
            document.addEventListener('touchmove', reportScrollProgress, { passive: true });
            document.addEventListener('touchend', function() {
                // Delayed check after touch ends (momentum scroll)
                setTimeout(reportScrollProgress, 100);
                setTimeout(reportScrollProgress, 300);
            }, { passive: true });
            document.addEventListener('DOMContentLoaded', function() {
                console.log('[SCROLL_PROGRESS_IFRAME] DOMContentLoaded (configured)');
                reportScrollProgress();
            });
        })();

        // Handle all link clicks: anchors scroll in-page, same-domain navigates internally, cross-domain opens externally
        (function() {
            var articleUrl = decodeURIComponent('${encodeURIComponent(url)}');
            var articleHostname = '';
            try { articleHostname = new URL(articleUrl).hostname; } catch(e) {}
            var scrollStack = [];

            document.addEventListener('click', function(e) {
                var link = e.target.closest ? e.target.closest('a') : null;
                if (!link) return;
                var href = link.getAttribute('href');
                if (!href) return;

                // Anchor links: scroll within page
                if (href.charAt(0) === '#') {
                    if (href === '#') return;
                    var targetId = href.substring(1);
                    var target = document.getElementById(targetId) || document.querySelector('[name="' + CSS.escape(targetId) + '"]');
                    if (!target) return;
                    e.preventDefault();
                    var currentScroll = window.scrollY || document.documentElement.scrollTop;
                    scrollStack.push(currentScroll);
                    history.pushState({ anchorScroll: true }, '', href);
                    target.scrollIntoView({ behavior: 'smooth' });
                    return;
                }

                // Resolve relative URLs against article URL
                var resolvedUrl;
                try { resolvedUrl = new URL(href, articleUrl).href; } catch(err) { return; }

                // Skip non-http(s) protocols (mailto:, tel:, javascript:, etc.)
                if (resolvedUrl.indexOf('http') !== 0) return;

                var linkHostname;
                try { linkHostname = new URL(resolvedUrl).hostname; } catch(err) { return; }

                e.preventDefault();

                if (linkHostname === articleHostname && window.parent && window.parent !== window) {
                    // Same domain: navigate within iframe via parent
                    window.parent.postMessage({ type: 'NAVIGATE_INTERNAL', url: resolvedUrl }, '*');
                } else if (window.parent && window.parent !== window) {
                    // Different domain: open externally via parent
                    window.parent.postMessage({ type: 'OPEN_EXTERNAL', url: resolvedUrl }, '*');
                }
            });

            window.addEventListener('popstate', function() {
                if (scrollStack.length > 0) {
                    var pos = scrollStack.pop();
                    window.scrollTo({ top: pos, behavior: 'smooth' });
                }
            });
        })();
    </script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: ${effectiveFontSize}; line-height: 1.6; touch-action: manipulation; }
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

        /* Dark theme scrollbar */
        ${
          isDark
            ? `
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.1); }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
        * { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1); }
        `
            : ''
        }
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
    // The iframe load event will call setIsLoading(false) once the content is rendered
    iframeHandlesLoading = true
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    // eslint-disable-next-line no-console
    console.error('[AUTH]    ❌ Error:', msg)
    if (!isStale?.()) {
      setError(`Extraction avec sélecteurs échouée: ${msg}`)
    }
  } finally {
    const stale = isStale?.() ?? false
    // eslint-disable-next-line no-console
    console.log('[AUTH] ✨ CONFIGURED VIEW finalizing (stale=' + String(stale) + ')')

    if (stale) {
      // This load was superseded by a newer one. Do NOT call setIsLoading(false) here —
      // the newer load is still running and owns the loading state.
      // Also skip logout so the newer load can reuse the auth session.
      // eslint-disable-next-line no-console
      console.log('[AUTH] ⚠️ Stale load: skipping setIsLoading + logout (newer load owns the session)')
    } else {
      // 7. Perform logout if configured (this is the active load, safe to logout)
      if (authConfig?.logoutUrl) {
        await performAuthLogout(authConfig.logoutUrl)
      } else if (authConfig) {
        // eslint-disable-next-line no-console
        console.log('[AUTH] ℹ️ No logout URL configured - session may persist')
      }
      // Only release loading here for error paths. On success, the iframe load event does it.
      if (!iframeHandlesLoading) {
        setIsLoading(false)
      }
    }
  }
}
