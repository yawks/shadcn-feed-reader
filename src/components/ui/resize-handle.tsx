import React from 'react'
import { cn } from '@/lib/utils'

interface ResizeHandleProps {
  readonly onMouseDown: () => void
  readonly className?: string
  readonly style?: React.CSSProperties
}

export function ResizeHandle({ onMouseDown, className, style }: ResizeHandleProps) {
  return (
    <button
      type="button"
      className={cn(
        "group relative flex w-0 cursor-col-resize items-center justify-center bg-transparent hover:bg-muted border-0 p-0",
        className
      )}
      style={style}
      onMouseDown={onMouseDown}
      aria-label="Redimensionner le panneau"
    >
      {/* Ligne de séparation visible */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-border transform -translate-x-1/2" />
      
      {/* Zone de survol plus large pour faciliter l'interaction */}
      <div className="absolute inset-y-0 -left-2 -right-2 z-10" />
      
      {/* Indicateur visuel au survol */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-primary opacity-0 group-hover:opacity-70 transform -translate-x-1/2" />
      
      {/* Points de redimensionnement au centre */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col space-y-1 opacity-0 group-hover:opacity-60">
        <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
        <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
        <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
      </div>
    </button>
  )
}
