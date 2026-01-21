import { IconArrowLeft, IconBook, IconExternalLink, IconEye, IconFilter } from "@tabler/icons-react"
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
import { useTranslation } from "react-i18next"

export type ArticleViewMode = "original" | "readability" | "configured"

interface ArticleToolbarProps {
    viewMode: ArticleViewMode
    onViewModeChange: (mode: ArticleViewMode) => void
    articleUrl?: string
    feedFaviconUrl?: string
    articleTitle?: string
    feedId?: string
    hasSelectorConfig?: boolean
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
    hasSelectorConfig = false,
    isMobile = false,
    isLandscape = false,
    onBack,
}: ArticleToolbarProps) {
    const { t } = useTranslation()
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)

    const baseViewModes = [
        {
            mode: "original" as const,
            Icon: IconEye,
            label: t('article_toolbar.original'),
        },
        {
            mode: "readability" as const,
            Icon: IconBook,
            label: t('article_toolbar.readability'),
        },
    ]

    // Add configured mode only if selectors are configured
    const viewModes = hasSelectorConfig
        ? [...baseViewModes, {
            mode: "configured" as const,
            Icon: IconFilter,
            label: t('article_toolbar.configured'),
        }]
        : baseViewModes

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
                        aria-label={t('article_toolbar.back')}
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
                            alt={articleTitle || t('article_toolbar.article')}
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
                                alt={articleTitle || t('article_toolbar.article')}
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
                                            aria-label={t('article_toolbar.view_mode')}
                                        >
                                            <CurrentIcon className="h-5 w-5" />
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>{t('article_toolbar.view_mode')}</TooltipContent>
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
                                    aria-label={t('article_toolbar.source')}
                                    className="gap-1"
                                >
                                    <IconExternalLink className="h-4 w-4" />
                                    <span className="text-sm">{t('article_toolbar.source')}</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('article_toolbar.open_in_browser')}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
        </div>
    )
}