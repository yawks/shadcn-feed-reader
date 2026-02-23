import { useState, useRef, useEffect } from 'react'
import { Copy, Maximize2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface ImageContextMenuProps {
  imageUrl: string | null
  onClose: () => void
}

interface FullscreenImageZoomProps {
  imageUrl: string
  onClose: () => void
}

function FullscreenImageZoom({ imageUrl, onClose }: FullscreenImageZoomProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const initialDistanceRef = useRef(0)
  const initialScaleRef = useRef(1)
  const lastTouchCenterRef = useRef({ x: 0, y: 0 })
  const lastPanRef = useRef({ x: 0, y: 0 })
  const pinchStartPanRef = useRef({ x: 0, y: 0 })
  const pinchStartCenterRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const container = containerRef.current
    const image = imageRef.current
    if (!container || !image) return

    const getTouchCenter = (touch1: Touch, touch2: Touch) => ({
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    })

    const applyZoom = (newScale: number, panX: number, panY: number) => {
      const clampedScale = Math.max(1.0, Math.min(5, newScale))
      const finalPanX = clampedScale === 1.0 ? 0 : panX
      const finalPanY = clampedScale === 1.0 ? 0 : panY
      setScale(clampedScale)
      setPan({ x: finalPanX, y: finalPanY })
      lastPanRef.current = { x: finalPanX, y: finalPanY }
    }

    const resetZoom = () => applyZoom(1, 0, 0)

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        initialDistanceRef.current = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        initialScaleRef.current = scale
        pinchStartPanRef.current = { x: lastPanRef.current.x, y: lastPanRef.current.y }
        pinchStartCenterRef.current = getTouchCenter(touch1, touch2)
        lastTouchCenterRef.current = pinchStartCenterRef.current
      } else if (e.touches.length === 1 && scale > 1) {
        lastTouchCenterRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        e.preventDefault()
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
        if (initialDistanceRef.current > 0) {
          const newScale = Math.max(1.0, Math.min(5, initialScaleRef.current * (currentDistance / initialDistanceRef.current)))
          const touchCenter = getTouchCenter(touch1, touch2)
          const scaleRatio = newScale / initialScaleRef.current
          const newPanX = touchCenter.x - (pinchStartCenterRef.current.x - pinchStartPanRef.current.x) * scaleRatio
          const newPanY = touchCenter.y - (pinchStartCenterRef.current.y - pinchStartPanRef.current.y) * scaleRatio
          applyZoom(newScale, newPanX, newPanY)
          lastTouchCenterRef.current = touchCenter
        }
      } else if (e.touches.length === 1 && scale > 1) {
        e.preventDefault()
        const touch = e.touches[0]
        const deltaX = touch.clientX - lastTouchCenterRef.current.x
        const deltaY = touch.clientY - lastTouchCenterRef.current.y
        applyZoom(scale, lastPanRef.current.x + deltaX, lastPanRef.current.y + deltaY)
        lastTouchCenterRef.current = { x: touch.clientX, y: touch.clientY }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && initialDistanceRef.current > 0) {
        initialDistanceRef.current = 0
        initialScaleRef.current = scale
        pinchStartPanRef.current = { x: lastPanRef.current.x, y: lastPanRef.current.y }
      }
      if (e.touches.length === 1) {
        lastTouchCenterRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      } else if (e.touches.length === 0) {
        lastTouchCenterRef.current = { x: 0, y: 0 }
      }
    }

    let lastTapTime = 0
    const handleDoubleTap = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        const currentTime = Date.now()
        const tapLength = currentTime - lastTapTime
        if (tapLength < 300 && tapLength > 0) resetZoom()
        lastTapTime = currentTime
      }
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: false })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })
    container.addEventListener('touchend', handleDoubleTap, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchend', handleDoubleTap)
    }
  }, [scale])

  return (
    <div
      ref={containerRef}
      className='fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-black'
      style={{ touchAction: 'manipulation' }}
      onClick={() => { if (scale === 1) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      tabIndex={-1}
    >
      <img
        ref={imageRef}
        src={imageUrl}
        alt='Fullscreen image'
        className='max-h-full max-w-full object-contain'
        style={{
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: scale === 1 ? 'transform 0.2s' : 'none',
        }}
        onClick={(e) => { if (scale > 1) e.stopPropagation() }}
        draggable={false}
      />
    </div>
  )
}

export function ImageContextMenu({ imageUrl, onClose }: ImageContextMenuProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null)

  const showContextMenu = !!imageUrl

  const handleFullscreen = () => {
    if (!imageUrl) return
    setFullscreenImageUrl(imageUrl)
    onClose()
    setIsFullscreenOpen(true)
  }

  const handleCopy = async () => {
    if (!imageUrl) return
    setIsCopying(true)
    try {
      await navigator.clipboard.writeText(imageUrl)
      toast.success('Image URL copied to clipboard')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[ImageContextMenu] Copy failed:', error)
      toast.error('Failed to copy image URL')
    } finally {
      setIsCopying(false)
      onClose()
    }
  }

  return (
    <>
      {showContextMenu && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'
          onClick={onClose}
        >
          <div
            className='bg-background min-w-[200px] rounded-lg border p-2 shadow-lg'
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant='ghost'
              className='w-full justify-start gap-2'
              onClick={handleFullscreen}
            >
              <Maximize2 className='h-4 w-4' />
              <span>Fullscreen</span>
            </Button>
            <Button
              variant='ghost'
              className='w-full justify-start gap-2'
              onClick={handleCopy}
              disabled={isCopying}
            >
              <Copy className='h-4 w-4' />
              <span>{isCopying ? 'Copying...' : 'Copy URL'}</span>
            </Button>
          </div>
        </div>
      )}

      {isFullscreenOpen && fullscreenImageUrl && (
        <FullscreenImageZoom
          imageUrl={fullscreenImageUrl}
          onClose={() => {
            setIsFullscreenOpen(false)
            setFullscreenImageUrl(null)
          }}
        />
      )}
    </>
  )
}
