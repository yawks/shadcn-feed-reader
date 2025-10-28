import { IconBook, IconEye, IconMoon } from "@tabler/icons-react"
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
}

export function ArticleToolbar({
    viewMode,
    onViewModeChange,
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

    return (
        <div className="flex items-center space-x-2" style={{ backgroundColor: 'rgb(34, 34, 34)' }}>
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
    )
}