import { ArticleToolbar, ArticleViewMode } from "./ArticleToolbar"
import { useEffect, useRef, useState } from "react"

import { FeedItem } from "@/backends/types"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { extractArticle } from "@/lib/article-extractor"
import { fetchRawHtml } from "@/lib/raw-html"
import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import { useTheme } from "@/context/theme-context"

type FeedArticleProps = {
    item: FeedItem
    isMobile?: boolean
}

const safeInvoke = async (cmd: string, args?: Record<string, unknown>) => {
    // Use tauri core invoke under the hood
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tauriInvoke as any)(cmd, args)
}

export function FeedArticle({ item, isMobile = false }: FeedArticleProps) {
    const { theme } = useTheme()

    const [isLoading, setIsLoading] = useState(true)
    const [articleContent, setArticleContent] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<ArticleViewMode>("readability")
    const [proxyPort, setProxyPort] = useState<number | null>(null)

    const iframeRef = useRef<HTMLIFrameElement>(null)

    // Now all view modes use iframe for isolated scroll context
    const isIframeView = true

    useEffect(() => {
        // Start the proxy (Tauri) if available; ignore errors in browser dev
        // try to start the tauri proxy; ignore if not available in dev
        safeInvoke("start_proxy")
            .then((port) => setProxyPort(Number(port)))
            // .catch((err) => console.debug("start_proxy not available or failed (dev):", err))
            .catch(() => {/* ignore in browser/dev */})
    }, [])


    useEffect(() => {
        const resetState = () => {
            setIsLoading(true)
            setError(null)
            setArticleContent("")
        }

        const setIframeUrl = (url: string) => {
            if (iframeRef.current) iframeRef.current.src = url
        }

        const handleReadabilityView = async () => {
            if (!item.url) return
            resetState()
            try {
                // Fetch raw HTML and extract article content using Readability
                let html: string
                try {
                    html = await fetchRawHtml(item.url)
                } catch (_invokeErr) {
                    // Fallback to direct fetch if Tauri is not available (browser/dev)
                    const res = await fetch(item.url, { method: 'GET', mode: 'cors' })
                    if (!res.ok) {
                        setViewMode('original')
                        setIsLoading(false)
                        return
                    }
                    html = await res.text()
                }

                let summary = ''
                try {
                    const article = extractArticle(html, { url: item.url })
                    summary = article?.content || ''
                } catch (_parseErr) {
                    setViewMode('original')
                    setIsLoading(false)
                    return
                }
                setArticleContent(summary)
                // eslint-disable-next-line no-console
                console.debug('[DIAG] FeedArticle: extracted articleContent length=', summary?.length)

                // Create a blob HTML document with the extracted content and safe-area padding
                // This creates an isolated scroll context (like original mode) that respects insets
                const blobHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        html, body {
            height: 100%;
            background-color: rgb(34, 34, 34);
            color: rgb(229, 229, 229);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            /* Use safe-area-inset-bottom for bottom spacing */
            padding: 0;
        }
        body {
            padding: 1rem;
            min-height: 100vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        a {
            color: rgb(96, 165, 250);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        /* Add spacing to ensure last line of content is visible */
        body::after {
            content: '';
            display: block;
            height: max(6rem, env(safe-area-inset-bottom, 1rem));
        }
    </style>
</head>
<body>
    ${summary}
</body>
</html>
`
                const blob = new Blob([blobHtml], { type: 'text/html' })
                const blobUrl = URL.createObjectURL(blob)
                setIframeUrl(blobUrl)
            } catch (_err) {
                setViewMode('original')
            } finally {
                setIsLoading(false)
            }
        }

        const handleOriginalView = async () => {
            if (!item.url) return
            resetState()
            try {
                if (proxyPort) {
                    await safeInvoke('set_proxy_url', { url: item.url })
                    const proxyUrl = `http://localhost:${proxyPort}/proxy?url=${encodeURIComponent(item.url)}`
                    setIframeUrl(proxyUrl)
                } else {
                    setIframeUrl(item.url)
                }
            } catch (_err) {
                setError(_err instanceof Error ? _err.message : String(_err))
            } finally {
                setIsLoading(false)
            }
        }

        if (viewMode === "readability") {
            handleReadabilityView()
        } else {
            handleOriginalView()
        }
    }, [item.url, viewMode, proxyPort])

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
                    if (item?.url) {
                        const u = new URL(item.url)
                        targetOrigin = u.origin
                    }
                } catch {
                    // If URL parsing fails, fall back to '*'
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
                // Try to read iframe size if same-origin (will throw if cross-origin)
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

    const handleViewModeChange = (mode: ArticleViewMode) => {
        setViewMode(mode)
    }

    return (
        <div
            className={cn(
                "flex h-full w-full flex-col rounded-md border bg-primary-foreground shadow-sm",
                {
                    flex: isMobile,
                    "absolute inset-0 left-full z-50 hidden w-full flex-1 transition-all duration-200 sm:static sm:z-auto sm:flex":
                        !isMobile,
                },
            )}
        >
            <div className="mb-1 flex h-full flex-none flex-col rounded-t-md bg-secondary shadow-lg" style={{ backgroundColor: 'rgb(34, 34, 34)' }}>
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
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                            <p className="text-sm text-red-500">{error}</p>
                        </div>
                    )}
                    {!error && (
                        <iframe
                            key={item.url}
                            ref={iframeRef}
                            className={cn("block h-full w-full", {
                                invisible: isLoading,
                            })}
                            src="about:blank"
                            title="Feed article"
                            sandbox="allow-scripts allow-same-origin"
                            style={{ border: 0 }}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}