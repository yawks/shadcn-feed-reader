import * as React from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Detect if we're running on a real mobile device (not just small screen)
 * Uses device capabilities and screen size
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false

  // Check for touch device with coarse pointer (real mobile device)
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // Check user agent for mobile devices
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
  const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())

  // Check screen size - if either dimension is small, likely mobile
  const isSmallScreen = window.innerWidth < MOBILE_BREAKPOINT || window.innerHeight < MOBILE_BREAKPOINT

  return (hasCoarsePointer && hasTouchScreen) && (isMobileUserAgent || isSmallScreen)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const updateIsMobile = () => {
      setIsMobile(isMobileDevice())
    }

    updateIsMobile()

    window.addEventListener('resize', updateIsMobile)
    window.addEventListener('orientationchange', updateIsMobile)

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
