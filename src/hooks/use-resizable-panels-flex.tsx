import { useCallback, useEffect, useState } from 'react'

interface UseResizablePanelsFlexOptions {
  leftPanelKey: string
  rightPanelKey: string
  defaultLeftFlex: number
  defaultRightFlex: number
  minLeftFlex?: number
  minRightFlex?: number
}

export function useResizablePanelsFlex({
  leftPanelKey,
  rightPanelKey,
  defaultLeftFlex,
  defaultRightFlex,
  minLeftFlex = 0.15,
  minRightFlex = 0.15
}: UseResizablePanelsFlexOptions) {
  const [leftFlex, setLeftFlex] = useState(() => {
    const saved = localStorage.getItem(leftPanelKey)
    return saved ? parseFloat(saved) : defaultLeftFlex
  })

  const [rightFlex, setRightFlex] = useState(() => {
    const saved = localStorage.getItem(rightPanelKey)
    return saved ? parseFloat(saved) : defaultRightFlex
  })

  const [isResizing, setIsResizing] = useState(false)

  // Sauvegarder dans localStorage quand les dimensions changent
  useEffect(() => {
    localStorage.setItem(leftPanelKey, leftFlex.toString())
  }, [leftFlex, leftPanelKey])

  useEffect(() => {
    localStorage.setItem(rightPanelKey, rightFlex.toString())
  }, [rightFlex, rightPanelKey])

  const handleMouseDown = useCallback(() => {
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return

    const containerRect = document.querySelector('.resizable-container')?.getBoundingClientRect()
    if (!containerRect) return

    const mouseX = e.clientX - containerRect.left
    const containerWidth = containerRect.width
    const newLeftRatio = mouseX / containerWidth
    const newRightRatio = 1 - newLeftRatio

    if (newLeftRatio >= minLeftFlex && newRightRatio >= minRightFlex) {
      setLeftFlex(newLeftRatio)
      setRightFlex(newRightRatio)
    }
  }, [isResizing, minLeftFlex, minRightFlex])

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

  const resetToDefaults = useCallback(() => {
    setLeftFlex(defaultLeftFlex)
    setRightFlex(defaultRightFlex)
  }, [defaultLeftFlex, defaultRightFlex])

  return {
    leftFlex,
    rightFlex,
    isResizing,
    handleMouseDown,
    setLeftFlex,
    setRightFlex,
    resetToDefaults
  }
}
