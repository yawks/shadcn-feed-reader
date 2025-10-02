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
    const [rawHtml, setRawHtml] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<ArticleViewMode>("readability")

    const iframeRef = useRef<HTMLIFrameElement>(null)

    const isIframeView = viewMode === "original" || viewMode === "dark"

    useEffect(() => {
        const fetchArticleContent = async () => {
            if (!item.url) return

            setIsLoading(true)
            setError(null)
            setRawHtml(null)

            try {
                if (viewMode === "readability") {
                    const content: string = await invoke("fetch_article", {
                        url: item.url,
                    })
                    if (content === FALLBACK_SIGNAL) {
                        setViewMode("original")
                    } else {
                        setArticleContent(content)
                    }
                } else if (isIframeView) {
                    const html: string = await invoke("fetch_raw_html", {
                        url: item.url,
                    })
                    setRawHtml(html)
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
            } finally {
                setIsLoading(false)
            }
        }

        fetchArticleContent()
    }, [item.url, viewMode, isIframeView])

    useEffect(() => {
        if (isIframeView && iframeRef.current) {
            const iframe = iframeRef.current
            const handleLoad = async () => {
                setIsLoading(false)
                const doc = iframe.contentDocument
                if (!doc) {
                    return
                }

                const style = doc.getElementById(NATIVE_DARK_READER_STYLE_ID)

                if (viewMode === "dark") {
                    if (style) return

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
                } else {
                    if (style) {
                        style.remove()
                    }
                    disableDarkMode()
                }
            }
            iframe.addEventListener("load", handleLoad)
            return () => {
                iframe.removeEventListener("load", handleLoad)
                const doc = iframe.contentDocument
                if (doc) {
                    const style = doc.getElementById(NATIVE_DARK_READER_STYLE_ID)
                    if (style) {
                        style.remove()
                    }
                }
                disableDarkMode()
            }
        }
    }, [isIframeView, viewMode, theme])

    const handleViewModeChange = (mode: ArticleViewMode) => {
        setIsLoading(true)
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
                                ref={iframeRef}
                                className={cn("h-full w-full", {
                                    invisible: isLoading || !rawHtml,
                                })}
                                srcDoc={rawHtml ?? ""}
                                title="Feed article"
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