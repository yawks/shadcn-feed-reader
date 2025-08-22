import { useCallback, useEffect, useState } from 'react'

interface UseSidebarResizeOptions {
  sidebarWidthKey: string
  defaultSidebarWidth: number
  minSidebarWidth?: number
  maxSidebarWidth?: number
}

export function useSidebarResize({
  sidebarWidthKey,
  defaultSidebarWidth,
  minSidebarWidth = 200,
  maxSidebarWidth = 400
}: UseSidebarResizeOptions) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(sidebarWidthKey)
    return saved ? parseInt(saved, 10) : defaultSidebarWidth
  })

  const [isResizing, setIsResizing] = useState(false)

  // Sauvegarder dans localStorage et mettre à jour la variable CSS
  useEffect(() => {
    localStorage.setItem(sidebarWidthKey, sidebarWidth.toString())
    
    // Mettre à jour immédiatement sans animation
    const sidebarContainer = document.querySelector('[data-slot="sidebar-container"]') as HTMLElement
    const sidebarGap = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement
    
    // Désactiver temporairement les transitions
    if (sidebarContainer) {
      sidebarContainer.style.transition = 'none'
      sidebarContainer.style.width = `${sidebarWidth}px`
    }
    if (sidebarGap) {
      sidebarGap.style.transition = 'none'
      sidebarGap.style.width = `${sidebarWidth}px`
    }
    
    // Mettre à jour la variable CSS globale
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`)
    
    // Forcer un reflow puis réactiver les transitions (pour les futures interactions)
    setTimeout(() => {
      if (sidebarContainer) {
        sidebarContainer.style.transition = ''
      }
      if (sidebarGap) {
        sidebarGap.style.transition = ''
      }
    }, 0)
  }, [sidebarWidth, sidebarWidthKey])

  const handleMouseDown = useCallback(() => {
    setIsResizing(true)
    
    // Désactiver les transitions CSS pendant le redimensionnement
    const sidebarContainer = document.querySelector('[data-slot="sidebar-container"]') as HTMLElement
    const sidebarGap = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement
    const contentElement = document.getElementById('content') as HTMLElement
    
    if (sidebarContainer) {
      sidebarContainer.style.transition = 'none'
    }
    if (sidebarGap) {
      sidebarGap.style.transition = 'none'
    }
    if (contentElement) {
      contentElement.style.transition = 'none'
    }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return

    // Calculer la nouvelle largeur basée sur la position X de la souris
    const newWidth = e.clientX

    if (newWidth >= minSidebarWidth && newWidth <= maxSidebarWidth) {
      setSidebarWidth(newWidth)
      
      // Mettre à jour la variable CSS globale
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`)
      
      // Forcer la mise à jour du container de la sidebar
      const sidebarContainer = document.querySelector('[data-slot="sidebar-container"]') as HTMLElement
      if (sidebarContainer) {
        sidebarContainer.style.width = `${newWidth}px`
      }
      
      // Forcer la mise à jour du gap de la sidebar
      const sidebarGap = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement
      if (sidebarGap) {
        sidebarGap.style.width = `${newWidth}px`
      }
    }
  }, [isResizing, minSidebarWidth, maxSidebarWidth, setSidebarWidth])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
    
    // Réactiver les transitions CSS après le redimensionnement
    const sidebarContainer = document.querySelector('[data-slot="sidebar-container"]') as HTMLElement
    const sidebarGap = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement
    const contentElement = document.getElementById('content') as HTMLElement
    
    if (sidebarContainer) {
      sidebarContainer.style.transition = ''
    }
    if (sidebarGap) {
      sidebarGap.style.transition = ''
    }
    if (contentElement) {
      contentElement.style.transition = ''
    }
  }, [])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  const resetToDefault = useCallback(() => {
    setSidebarWidth(defaultSidebarWidth)
  }, [defaultSidebarWidth])

  return {
    sidebarWidth,
    isResizing,
    handleMouseDown,
    setSidebarWidth,
    resetToDefault
  }
}
