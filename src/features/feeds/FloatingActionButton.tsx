import { ArticleViewMode } from "./ArticleToolbar"
import { IconBook, IconExternalLink, IconEye, IconFilter } from "@tabler/icons-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface FloatingActionButtonProps {
    viewMode: ArticleViewMode
    onViewModeChange: (mode: ArticleViewMode) => void
    articleUrl?: string
    hasSelectorConfig?: boolean
}

export function FloatingActionButton({
    viewMode,
    onViewModeChange,
    articleUrl,
    hasSelectorConfig = false,
}: FloatingActionButtonProps) {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)

    const baseViewModes = [
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
    ]

    // Add configured mode only if selectors are configured
    const viewModes = hasSelectorConfig
        ? [...baseViewModes, {
            mode: "configured" as const,
            Icon: IconFilter,
            label: "Sélecteurs",
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

        setIsPopoverOpen(false)

        // Try to open with Tauri first (for native app)
        try {
            const mod = await import('@tauri-apps/plugin-shell')
            if (typeof mod.open === 'function') {
                await mod.open(articleUrl)
            } else {
                window.open(articleUrl, "_blank", "noopener,noreferrer")
            }
        } catch (_e) {
            // Fallback to window.open for web or if Tauri is not available
            window.open(articleUrl, "_blank", "noopener,noreferrer")
        }
    }

    return (
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger asChild>
                <Button
                    size="icon"
                    className="h-12 w-12 rounded-full shadow-lg"
                    aria-label="Options d'affichage"
                >
                    <CurrentIcon className="h-5 w-5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2 mb-2" align="end" side="top">
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
                    {articleUrl && (
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-2"
                            onClick={handleSourceClick}
                            aria-label="Voir la source"
                        >
                            <IconExternalLink className="h-4 w-4" />
                            <span className="text-sm">Source</span>
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
