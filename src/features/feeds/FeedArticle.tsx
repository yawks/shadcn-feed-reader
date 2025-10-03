import { useEffect, useRef, useState } from "react"
import {
    disable as disableDarkMode,
    enable as enableDarkMode,
    exportGeneratedCSS,
} from "darkreader"

import { FeedItem } from "@/backends/types"
import { Skeleton } from "@/components/ui/skeleton"
import { useTheme } from "@/context/theme-context"
import { cn } from "@/lib/utils"
import { invoke } from "@tauri-apps/api/core"

import { ArticleToolbar, ArticleViewMode } from "./ArticleToolbar"

const FALLBACK_SIGNAL = "READABILITY_FAILED_FALLBACK"
const NATIVE_DARK_READER_STYLE_ID = "dark-reader-style"

interface FeedArticleProps {
    readonly item: FeedItem
    readonly isMobile?: boolean
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
        invoke("start_proxy")
            .then(port => setProxyPort(port as number))
            .catch(err => {
                console.error("Failed to start proxy:", err)
                setError("Failed to start proxy server.")
            })
    }, [])

    useEffect(() => {
        const setupView = async () => {
            if (!item.url) return

            setIsLoading(true)
            setError(null)
            setArticleContent("")

            if (viewMode === "readability") {
                try {
                    const content: string = await invoke("fetch_article", { url: item.url })
                    if (content === FALLBACK_SIGNAL) {
                        setViewMode("original")
                    } else {
                        setArticleContent(content)
                    }
                } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                } finally {
                    setIsLoading(false)
                }
            } else if (isIframeView && proxyPort) {
                try {
                    await invoke("set_proxy_url", { url: item.url });
                    const targetUrl = new URL(item.url);
                    // Use a consistent path for the initial load, letting the proxy handle the full path
                    const proxyUrl = `http://localhost:${proxyPort}${targetUrl.pathname}${targetUrl.search}`;
                    if (iframeRef.current) {
                        // A key is used here to force a re-mount, ensuring the new src is loaded.
                        iframeRef.current.src = proxyUrl;
                    }
                } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                    setIsLoading(false);
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

        const handleLoad = async () => {
            setIsLoading(false)
            const doc = iframe.contentDocument
            if (!doc) return

            const oldStyle = doc.getElementById(NATIVE_DARK_READER_STYLE_ID)
            if (oldStyle) {
                oldStyle.remove()
            }
            disableDarkMode()

            if (viewMode === "dark") {
                enableDarkMode({
                    brightness: 100,
                    contrast: 90,
                    sepia: 10,
                })
                const css = await exportGeneratedCSS()
                disableDarkMode()

                const newStyle = doc.createElement("style")
                newStyle.id = NATIVE_DARK_READER_STYLE_ID
                newStyle.textContent = css
                doc.head.appendChild(newStyle)
            }
        }

        iframe.addEventListener("load", handleLoad)
        return () => {
            iframe.removeEventListener("load", handleLoad)
        }
    }, [isIframeView, viewMode, theme])

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
                    <ArticleToolbar
                        viewMode={viewMode}
                        onViewModeChange={handleViewModeChange}
                    />
                </div>
                <div className="relative h-full w-full overflow-auto">
                    {isLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                            <div className="flex flex-col items-center space-y-4">
                                <Skeleton className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                <p className="text-sm text-muted-foreground">
                                    Loading article...
                                </p>
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
                                className={cn("h-full w-full", {
                                    invisible: isLoading,
                                })}
                                src="about:blank"
                                title="Feed article"
                                sandbox="allow-scripts allow-same-origin"
                            />
                        ) : (
                            <div
                                className="prose dark:prose-invert w-full p-4"
                                dangerouslySetInnerHTML={{ __html: articleContent }}
                            />
                        ))}
                </div>
            </div>
        </div>
    )
}