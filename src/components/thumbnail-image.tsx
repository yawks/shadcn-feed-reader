import type { ImgHTMLAttributes } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { secureImageUrl } from "@/lib/secure-image-url"

type ThumbnailImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null
  fallbackSrc?: string
  retryDelays?: number[]
}

const DEFAULT_FALLBACK = "/images/feed_icon.png"
const DEFAULT_RETRY_DELAYS = [1500, 4000]

export function ThumbnailImage({
  src,
  alt,
  className,
  fallbackSrc = DEFAULT_FALLBACK,
  retryDelays = DEFAULT_RETRY_DELAYS,
  onError,
  ...props
}: ThumbnailImageProps) {
  const sanitizedSrc = useMemo(() => {
    if (!src) return null
    return secureImageUrl(src)
  }, [src])

  const [currentSrc, setCurrentSrc] = useState<string>(
    sanitizedSrc ?? fallbackSrc,
  )
  const retryIndexRef = useRef(0)
  const retryTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    retryIndexRef.current = 0
    setCurrentSrc(sanitizedSrc ?? fallbackSrc)
    return () => {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [sanitizedSrc, fallbackSrc])

  const scheduleRetry = () => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    if (!sanitizedSrc) {
      setCurrentSrc(fallbackSrc)
      return
    }

    const currentRetryIndex = retryIndexRef.current
    if (currentRetryIndex >= retryDelays.length) {
      setCurrentSrc(fallbackSrc)
      return
    }

    const delay = retryDelays[currentRetryIndex]
    retryIndexRef.current += 1

    retryTimeoutRef.current = window.setTimeout(() => {
      const cacheBustingSrc = `${sanitizedSrc}${
        sanitizedSrc.includes("?") ? "&" : "?"
      }retry=${Date.now()}`
      setCurrentSrc(cacheBustingSrc)
    }, delay)
  }

  return (
    <img
      {...props}
      alt={alt}
      src={currentSrc}
      className={cn("block h-full w-full object-cover object-center", className)}
      style={{
        minWidth: '100%',
        minHeight: '100%',
        width: '100%',
        height: '100%',
        ...props.style,
      }}
      onError={(event) => {
        if (currentSrc === fallbackSrc) {
          onError?.(event)
          return
        }
        scheduleRetry()
        onError?.(event)
      }}
      onLoad={(event) => {
        // Force image to fill container after load
        const img = event.currentTarget
        img.style.width = '100%'
        img.style.height = '100%'
        img.style.minWidth = '100%'
        img.style.minHeight = '100%'
        props.onLoad?.(event)
      }}
    />
  )
}

