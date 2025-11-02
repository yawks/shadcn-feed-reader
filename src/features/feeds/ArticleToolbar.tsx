import { IconBook, IconExternalLink, IconEye, IconMoon } from "@tabler/icons-react"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

import { Button } from "@/components/ui/button"

export type ArticleViewMode = "original" | "readability" | "dark"

interface ArticleToolbarProps {
    viewMode: ArticleViewMode
    onViewModeChange: (mode: ArticleViewMode) => void
    articleUrl?: string
}

export function ArticleToolbar({
    viewMode,
    onViewModeChange,
    articleUrl,
}: ArticleToolbarProps) {
    const buttons = [
        {
            mode: "original",
            Icon: IconEye,
            tooltip: "Original",
        },
        {
            mode: "readability",
            Icon: IconBook,
            tooltip: "Readability",
        },
        {
            mode: "dark",
            Icon: IconMoon,
            tooltip: "Dark Mode",
        },
    ] as const

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
            <div className="flex items-center space-x-2">
                <TooltipProvider>
                    {buttons.map(({ mode, Icon, tooltip }) => (
                        <Tooltip key={mode}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={viewMode === mode ? "secondary" : "ghost"}
                                    size="icon"
                                    onClick={() => onViewModeChange(mode)}
                                    aria-label={tooltip}
                                >
                                    <Icon className="h-5 w-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{tooltip}</TooltipContent>
                        </Tooltip>
                    ))}
                </TooltipProvider>
            </div>
            {articleUrl && (
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
    )
}