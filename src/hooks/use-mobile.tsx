import * as React from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Detect if we're running on a real mobile device (not just small screen)
 * On Android/Capacitor, always return true (native mobile app)
 * Otherwise, use device capabilities and screen size
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any
  
  // If we're on Android/Capacitor (native app), always consider it mobile
  // regardless of orientation - native apps on phones should use mobile layout
  if (win.Capacitor?.getPlatform?.() === 'android') {
    return true
  }

  // For web browsers, use a combination of factors:
  // 1. Check for touch device with coarse pointer (real mobile device)
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // 2. Check user agent for mobile devices
  const userAgent = navigator.userAgent || navigator.vendor || win.opera
  const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())

  // 3. Check screen size - if either dimension is small, likely mobile
  const isSmallScreen = window.innerWidth < MOBILE_BREAKPOINT || window.innerHeight < MOBILE_BREAKPOINT

  // Consider it mobile if it's a touch device with coarse pointer
  // AND (has mobile user agent OR small screen)
  // This ensures tablets in landscape might still be considered mobile if they have touch
  return (hasCoarsePointer && hasTouchScreen) && (isMobileUserAgent || isSmallScreen)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(() => {
    // Initialize with correct value immediately on Android
    if (typeof window !== 'undefined') {
      const win = window as any
      if (win.Capacitor?.getPlatform?.() === 'android') {
        return true
      }
    }
    return undefined
  })

  React.useEffect(() => {
    const updateIsMobile = () => {
      const isMobileResult = isMobileDevice()
      // eslint-disable-next-line no-console
      console.log('🟢 [useIsMobile] updateIsMobile called', {
        isMobile: isMobileResult,
        width: window.innerWidth,
        height: window.innerHeight,
        platform: typeof window !== 'undefined' ? (window as any).Capacitor?.getPlatform?.() : 'unknown',
        userAgent: navigator.userAgent?.substring(0, 50),
      })
      // Log séparé pour faciliter le grep
      // eslint-disable-next-line no-console
      console.log('[useIsMobile] RESULT: isMobile=' + isMobileResult + ' width=' + window.innerWidth + ' height=' + window.innerHeight)
      setIsMobile(isMobileResult)
    }

    // Initial check
    updateIsMobile()

    // Listen to resize and orientation changes
    window.addEventListener('resize', updateIsMobile)
    window.addEventListener('orientationchange', updateIsMobile)
    
    // Also listen to visual viewport changes
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateIsMobile)
    }

    return () => {
      window.removeEventListener('resize', updateIsMobile)
      window.removeEventListener('orientationchange', updateIsMobile)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateIsMobile)
      }
    }
  }, [])

  return !!isMobile
}
