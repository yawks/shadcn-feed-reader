import * as React from 'react'

export function useOrientation() {
  const [isLandscape, setIsLandscape] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth > window.innerHeight
  })

  React.useEffect(() => {
    const updateOrientation = () => {
      // Use a small delay to ensure dimensions are updated after orientation change
      setTimeout(() => {
        const newIsLandscape = window.innerWidth > window.innerHeight
        // eslint-disable-next-line no-console
        console.log('🔄 [useOrientation] resize event - isLandscape:', newIsLandscape, 'width:', window.innerWidth, 'height:', window.innerHeight)
        setIsLandscape(newIsLandscape)
      }, 100)
    }

    // Check on mount
    const checkInitial = () => {
      const initialIsLandscape = window.innerWidth > window.innerHeight
      // eslint-disable-next-line no-console
      console.log('🔄 [useOrientation] initial check - isLandscape:', initialIsLandscape, 'width:', window.innerWidth, 'height:', window.innerHeight)
      setIsLandscape(initialIsLandscape)
    }
    checkInitial()

    // Listen to orientation changes with immediate check
    const handleOrientationChange = () => {
      // eslint-disable-next-line no-console
      console.log('🔄 [useOrientation] orientationchange event fired!')
      // Immediate check
      const immediateIsLandscape = window.innerWidth > window.innerHeight
      // eslint-disable-next-line no-console
      console.log('🔄 [useOrientation] immediate check - isLandscape:', immediateIsLandscape, 'width:', window.innerWidth, 'height:', window.innerHeight)
      setIsLandscape(immediateIsLandscape)
      // Then check again after a short delay to ensure accuracy
      setTimeout(() => {
        const delayedIsLandscape = window.innerWidth > window.innerHeight
        // eslint-disable-next-line no-console
        console.log('🔄 [useOrientation] delayed check - isLandscape:', delayedIsLandscape, 'width:', window.innerWidth, 'height:', window.innerHeight)
        setIsLandscape(delayedIsLandscape)
      }, 100)
    }

    window.addEventListener('resize', updateOrientation)
    window.addEventListener('orientationchange', handleOrientationChange)
    
    // Also listen to visual viewport changes for better accuracy
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateOrientation)
    }

    return () => {
      window.removeEventListener('resize', updateOrientation)
      window.removeEventListener('orientationchange', handleOrientationChange)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateOrientation)
      }
    }
  }, [])

  return isLandscape
}

