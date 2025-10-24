import { ArticleToolbar, ArticleViewMode } from "./ArticleToolbar"
import { useEffect, useRef, useState } from "react"

import { FeedItem } from "@/backends/types"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import { useTheme } from "@/context/theme-context"

const FALLBACK_SIGNAL = "READABILITY_FAILED_FALLBACK"

type FeedArticleProps = {
    item: FeedItem
    isMobile?: boolean
}

const safeInvoke = async (cmd: string, args?: Record<string, unknown>) => {
    const hasTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__?.invoke
    if (!hasTauri) {
        throw new Error('Tauri runtime not available')
    }
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

    const isIframeView = viewMode === "original" || viewMode === "dark"

    useEffect(() => {
        // Start the proxy (Tauri) if available; ignore errors in browser dev
        // try to start the tauri proxy; ignore if not available in dev
        safeInvoke("start_proxy")
            .then((port) => setProxyPort(Number(port)))
            .catch((err) => console.debug("start_proxy not available or failed (dev):", err))
    }, [])

    useEffect(() => {
        const setupView = async () => {
            if (!item.url) return

            setIsLoading(true)
            setError(null)
            setArticleContent("")

            if (viewMode === "readability") {
                try {
                    const content: string = await safeInvoke("fetch_article", { url: item.url })
                    if (content === FALLBACK_SIGNAL) {
                        setViewMode("original")
                    } else {
                        setArticleContent(content)
                    }
                } catch (err) {
                    // Browser fallback: attempt to fetch the page HTML directly if invoke isn't available
                    try {
                        const res = await fetch(item.url, { method: 'GET', mode: 'cors' })
                        if (!res.ok) {
                            setViewMode('original')
                        } else {
                            const text = await res.text()
                            setArticleContent(text)
                        }
                    } catch (fetchErr) {
                        console.info('Direct fetch failed (CORS or network), falling back to original view', fetchErr)
                        setViewMode('original')
                    }
                } finally {
                    setIsLoading(false)
                }
            } else if (isIframeView) {
                try {
                    const hasTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__?.invoke
                    if (hasTauri && proxyPort) {
                        await safeInvoke('set_proxy_url', { url: item.url })
                        const proxyUrl = `http://localhost:${proxyPort}/proxy?url=${encodeURIComponent(item.url)}`
                        if (iframeRef.current) iframeRef.current.src = proxyUrl
                    } else {
                        if (iframeRef.current) iframeRef.current.src = item.url
                    }
                } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                } finally {
                    setIsLoading(false)
                }
            }
        }

        if ((isIframeView && proxyPort) || !isIframeView) {
            setupView()
        }
    }, [item.url, viewMode, isIframeView, proxyPort])

    useEffect(() => {
        const iframe = iframeRef.current
        if (!isIframeView || !iframe) {
            return
        }

        const handleLoad = () => {
            setIsLoading(false)
            if (iframe.contentWindow) {
                // Prefer the iframe's origin as the target for postMessage to avoid leaking to other origins.
                let targetOrigin = '*'
                try {
                    if (item?.url) {
                        const u = new URL(item.url)
                        targetOrigin = u.origin
                    }
                } catch (e) {
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
            }
        }

        iframe.addEventListener("load", handleLoad)
        return () => {
            iframe.removeEventListener("load", handleLoad)
        }
    }, [isIframeView, viewMode, theme, proxyPort, item.url])

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
            <div className="mb-1 flex h-full flex-none flex-col rounded-t-md bg-secondary shadow-lg">
                <div className="flex items-center justify-between p-2">
                    <ArticleToolbar viewMode={viewMode} onViewModeChange={handleViewModeChange} />
                </div>
                <div className="relative h-full w-full overflow-auto">
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
                    {!error &&
                        (isIframeView ? (
                            <iframe
                                key={item.url}
                                ref={iframeRef}
                                className={cn("h-full w-full", { invisible: isLoading })}
                                src="about:blank"
                                title="Feed article"
                                sandbox="allow-scripts allow-same-origin"
                            />
                        ) : (
                            <div className="prose dark:prose-invert w-full p-4" dangerouslySetInnerHTML={{ __html: articleContent }} />
                        ))}
                </div>
            </div>
        </div>
    )
}