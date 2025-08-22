import { useCallback, useEffect, useState } from 'react'

interface UseResizablePanelsOptions {
  leftPanelKey: string
  rightPanelKey: string
  defaultLeftWidth: number
  defaultRightWidth: number
  minLeftWidth?: number
  minRightWidth?: number
}

export function useResizablePanels({
  leftPanelKey,
  rightPanelKey,
  defaultLeftWidth,
  defaultRightWidth,
  minLeftWidth = 200,
  minRightWidth = 300
}: UseResizablePanelsOptions) {
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem(leftPanelKey)
    return saved ? parseInt(saved, 10) : defaultLeftWidth
  })

  const [rightWidth, setRightWidth] = useState(() => {
    const saved = localStorage.getItem(rightPanelKey)
    return saved ? parseInt(saved, 10) : defaultRightWidth
  })

  const [isResizing, setIsResizing] = useState(false)

  // Sauvegarder dans localStorage quand les dimensions changent
  useEffect(() => {
    localStorage.setItem(leftPanelKey, leftWidth.toString())
  }, [leftWidth, leftPanelKey])

  useEffect(() => {
    localStorage.setItem(rightPanelKey, rightWidth.toString())
  }, [rightWidth, rightPanelKey])

  const handleMouseDown = useCallback(() => {
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return

    const containerRect = document.querySelector('.resizable-container')?.getBoundingClientRect()
    if (!containerRect) return

    const newLeftWidth = e.clientX - containerRect.left
    const newRightWidth = containerRect.width - newLeftWidth - 4 // 4px pour le handle

    if (newLeftWidth >= minLeftWidth && newRightWidth >= minRightWidth) {
      setLeftWidth(newLeftWidth)
      setRightWidth(newRightWidth)
    }
  }, [isResizing, minLeftWidth, minRightWidth])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
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

  // Recalculer les dimensions si le container change de taille
  useEffect(() => {
    const handleResize = () => {
      const containerRect = document.querySelector('.resizable-container')?.getBoundingClientRect()
      if (!containerRect) return

      const totalWidth = containerRect.width - 4 // Moins la largeur du handle
      const currentTotal = leftWidth + rightWidth

      if (currentTotal > totalWidth) {
        // Redimensionner proportionnellement si trop large
        const ratio = totalWidth / currentTotal
        setLeftWidth(Math.max(minLeftWidth, leftWidth * ratio))
        setRightWidth(Math.max(minRightWidth, rightWidth * ratio))
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [leftWidth, rightWidth, minLeftWidth, minRightWidth])

  return {
    leftWidth,
    rightWidth,
    isResizing,
    handleMouseDown,
    setLeftWidth,
    setRightWidth
  }
}
