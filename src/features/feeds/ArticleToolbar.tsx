import { IconArrowLeft, IconBook, IconExternalLink, IconEye } from "@tabler/icons-react"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

import { Button } from "@/components/ui/button"
import { FeedFavicon } from "@/components/ui/feed-favicon"
import { cn } from "@/lib/utils"
import { useState } from "react"

export type ArticleViewMode = "original" | "readability"

interface ArticleToolbarProps {
    viewMode: ArticleViewMode
    onViewModeChange: (mode: ArticleViewMode) => void
    articleUrl?: string
    feedFaviconUrl?: string
    articleTitle?: string
    isMobile?: boolean
    isLandscape?: boolean
    onBack?: () => void
}

export function ArticleToolbar({
    viewMode,
    onViewModeChange,
    articleUrl,
    feedFaviconUrl,
    articleTitle,
    isMobile = false,
    isLandscape = false,
    onBack,
}: ArticleToolbarProps) {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)

    const viewModes = [
        {
            mode: "original" as const,
            Icon: IconEye,
            label: "Original",
        },
        {
            mode: "readability" as const,
            Icon: IconBook,
            label: "Readability",
        },
    ] as const

    const currentMode = viewModes.find((m) => m.mode === viewMode) || viewModes[0]
    const CurrentIcon = currentMode.Icon

    const handleModeSelect = (mode: ArticleViewMode) => {
        onViewModeChange(mode)
        setIsPopoverOpen(false)
    }

    const handleSourceClick = async () => {
        if (!articleUrl) return

        // Debug: log when the function is called
        console.log('[ArticleToolbar] handleSourceClick called', articleUrl)

        // Try to open with Tauri first (for native app)
        try {
            const mod = await import('@tauri-apps/plugin-shell')
            console.log('[ArticleToolbar] @tauri-apps/plugin-shell loaded', mod)
            if (typeof mod.open === 'function') {
                await mod.open(articleUrl)
                console.log('[ArticleToolbar] Tauri shell.open called')
            } else {
                console.warn('[ArticleToolbar] open is not a function on plugin-shell, fallback to window.open')
                window.open(articleUrl, "_blank", "noopener,noreferrer")
            }
        } catch (e) {
            // Fallback to window.open for web or if Tauri is not available
            console.error('[ArticleToolbar] Failed to use Tauri shell.open, fallback to window.open', e)
            window.open(articleUrl, "_blank", "noopener,noreferrer")
        }
    }

    return (
        <div className="flex items-center justify-between w-full space-x-2" style={{ backgroundColor: 'rgb(34, 34, 34)' }}>
            <div className="flex items-center space-x-2 min-w-0 flex-1">
                {/* Back button - mobile only */}
                {isMobile && onBack && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onBack}
                        aria-label="Retour"
                        className="flex-shrink-0"
                    >
                        <IconArrowLeft className="h-5 w-5" />
                    </Button>
                )}
                {/* Favicon - mobile: no frame, 16x16 | desktop: in frame 36x36 */}
                {feedFaviconUrl && (
                    isMobile ? (
                        <FeedFavicon
                            src={feedFaviconUrl}
                            alt={articleTitle || "Article"}
                            className="size-4 object-contain flex-shrink-0"
                            onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement
                                target.src = 'https://www.google.com/s2/favicons?sz=64&domain=example.com'
                            }}
                        />
                    ) : (
                        <div className="size-9 rounded-md flex-shrink-0 flex items-center justify-center bg-background/50 border border-border">
                            <FeedFavicon
                                src={feedFaviconUrl}
                                alt={articleTitle || "Article"}
                                className="size-4 object-contain"
                                onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement
                                    target.src = 'https://www.google.com/s2/favicons?sz=64&domain=example.com'
                                }}
                            />
                        </div>
                    )
                )}
                {articleTitle && (
                    <span className={cn(
                        "font-medium text-foreground",
                        {
                            // Smaller text on mobile, normal on desktop
                            "text-xs": isMobile,
                            "text-sm": !isMobile,
                            // 1 line in landscape, 2 lines in portrait/desktop
                            "line-clamp-1": isMobile && isLandscape,
                            "line-clamp-2": !(isMobile && isLandscape),
                        }
                    )}>
                        {articleTitle}
                    </span>
                )}
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
                {/* Mode button - desktop only (mobile uses floating button) */}
                {!isMobile && (
                    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="secondary"
                                            size="icon"
                                            aria-label="Mode d'affichage"
                                        >
                                            <CurrentIcon className="h-5 w-5" />
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Mode d'affichage</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <PopoverContent className="w-48 p-2" align="start">
                            <div className="flex flex-col gap-1">
                                {viewModes.map(({ mode, Icon, label }) => (
                                    <Button
                                        key={mode}
                                        variant={viewMode === mode ? "secondary" : "ghost"}
                                        className="w-full justify-start gap-2"
                                        onClick={() => handleModeSelect(mode)}
                                        aria-label={label}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span className="text-sm">{label}</span>
                                    </Button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
                {/* Source button - desktop only */}
                {!isMobile && articleUrl && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSourceClick}
                                    aria-label="Voir la source"
                                    className="gap-1"
                                >
                                    <IconExternalLink className="h-4 w-4" />
                                    <span className="text-sm">Source</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Ouvrir l'article dans le navigateur</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
        </div>
    )
}