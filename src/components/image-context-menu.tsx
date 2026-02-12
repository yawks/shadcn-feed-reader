import { useState, useRef, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Copy, Maximize2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { startProxyServer } from '@/lib/raw-html'
import { safeInvoke } from '@/lib/safe-invoke'
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

      // Reset pan when zoom returns to 100%
      const finalPanX = clampedScale === 1.0 ? 0 : panX
      const finalPanY = clampedScale === 1.0 ? 0 : panY

      setScale(clampedScale)
      setPan({ x: finalPanX, y: finalPanY })
      lastPanRef.current = { x: finalPanX, y: finalPanY }
      // eslint-disable-next-line no-console
      console.log(
        '[ZOOM-DIAG] Fullscreen image: Applied zoom, scale:',
        clampedScale.toFixed(2)
      )
    }

    const resetZoom = () => {
      applyZoom(1, 0, 0)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        initialDistanceRef.current = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        initialScaleRef.current = scale
        pinchStartPanRef.current = {
          x: lastPanRef.current.x,
          y: lastPanRef.current.y,
        }
        pinchStartCenterRef.current = getTouchCenter(touch1, touch2)
        lastTouchCenterRef.current = pinchStartCenterRef.current
        // eslint-disable-next-line no-console
        console.log(
          '[ZOOM-DIAG] Fullscreen image: Pinch start, center:',
          pinchStartCenterRef.current
        )
      } else if (e.touches.length === 1 && scale > 1) {
        lastTouchCenterRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        }
        e.preventDefault()
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const currentDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )

        if (initialDistanceRef.current > 0) {
          const newScale = Math.max(
            1.0,
            Math.min(
              5,
              initialScaleRef.current *
                (currentDistance / initialDistanceRef.current)
            )
          )
          const touchCenter = getTouchCenter(touch1, touch2)

          // Calculate pan to keep the pinch center point fixed on content
          // Formula: newPan = touchCenter - (pinchStartCenter - pinchStartPan) * newScale / initialScale
          const scaleRatio = newScale / initialScaleRef.current
          const newPanX =
            touchCenter.x -
            (pinchStartCenterRef.current.x - pinchStartPanRef.current.x) *
              scaleRatio
          const newPanY =
            touchCenter.y -
            (pinchStartCenterRef.current.y - pinchStartPanRef.current.y) *
              scaleRatio

          applyZoom(newScale, newPanX, newPanY)
          lastTouchCenterRef.current = touchCenter
        }
      } else if (e.touches.length === 1 && scale > 1) {
        e.preventDefault()
        const touch = e.touches[0]
        const deltaX = touch.clientX - lastTouchCenterRef.current.x
        const deltaY = touch.clientY - lastTouchCenterRef.current.y

        const newPanX = lastPanRef.current.x + deltaX
        const newPanY = lastPanRef.current.y + deltaY
        applyZoom(scale, newPanX, newPanY)

        lastTouchCenterRef.current = { x: touch.clientX, y: touch.clientY }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && initialDistanceRef.current > 0) {
        // eslint-disable-next-line no-console
        console.log(
          '[ZOOM-DIAG] Fullscreen image: Pinch end, final scale:',
          scale.toFixed(2)
        )
        initialDistanceRef.current = 0
        initialScaleRef.current = scale
        // Update pinchStartPan for potential next pinch
        pinchStartPanRef.current = {
          x: lastPanRef.current.x,
          y: lastPanRef.current.y,
        }
      }
      // When one finger remains, update lastTouchCenter to that finger's position
      // to prevent a jump when transitioning from pinch to pan
      if (e.touches.length === 1) {
        lastTouchCenterRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        }
      } else if (e.touches.length === 0) {
        lastTouchCenterRef.current = { x: 0, y: 0 }
      }
    }

    // Double tap to reset
    let lastTapTime = 0
    const handleDoubleTap = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        const currentTime = Date.now()
        const tapLength = currentTime - lastTapTime
        if (tapLength < 300 && tapLength > 0) {
          resetZoom()
          // eslint-disable-next-line no-console
          console.log('[ZOOM-DIAG] Fullscreen image: Double tap - reset zoom')
        }
        lastTapTime = currentTime
      }
    }

    container.addEventListener('touchstart', handleTouchStart, {
      passive: false,
    })
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
      style={{
        touchAction: 'manipulation',
      }}
      onClick={() => {
        if (scale === 1) {
          onClose()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }}
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
        onClick={(e) => {
          if (scale > 1) {
            e.stopPropagation()
          }
        }}
        draggable={false}
      />
    </div>
  )
}

export function ImageContextMenu({ imageUrl, onClose }: ImageContextMenuProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(
    null
  )
  const isAndroid = Capacitor.getPlatform() === 'android'

  // Log when imageUrl changes
  // eslint-disable-next-line no-console
  console.log(
    '[ImageContextMenu] Render - imageUrl:',
    imageUrl,
    'isAndroid:',
    isAndroid,
    'isFullscreenOpen:',
    isFullscreenOpen,
    'fullscreenImageUrl:',
    fullscreenImageUrl
  )

  const handleFullscreen = () => {
    if (!imageUrl) {
      // eslint-disable-next-line no-console
      console.log('[ImageContextMenu] handleFullscreen: no imageUrl')
      return
    }
    // eslint-disable-next-line no-console
    console.log(
      '[ImageContextMenu] handleFullscreen: opening fullscreen for:',
      imageUrl
    )
    // Store the image URL before closing the menu
    setFullscreenImageUrl(imageUrl)
    // Close the context menu
    onClose()
    // Open the fullscreen dialog immediately
    setIsFullscreenOpen(true)
    // eslint-disable-next-line no-console
    console.log(
      '[ImageContextMenu] handleFullscreen: isFullscreenOpen set to true'
    )
  }

  // Don't show the context menu if no image URL or not Android
  const showContextMenu = imageUrl && isAndroid

  const handleShare = async () => {
    if (!imageUrl) return

    setIsSharing(true)
    try {
      // Share only the URL so WhatsApp can generate a preview
      await Share.share({
        url: imageUrl, // Direct image URL (not proxy URL)
      })
      onClose()
    } catch (error) {
      // User may have cancelled sharing, not an error
      // eslint-disable-next-line no-console
      console.log('[ImageContextMenu] Share cancelled or failed:', error)
      onClose()
    } finally {
      setIsSharing(false)
    }
  }

  const handleCopy = async () => {
    if (!imageUrl) return

    setIsCopying(true)
    try {
      // Utiliser le proxy pour télécharger l'image (évite les problèmes CORS)
      let proxyUrl: string
      let response: Response

      // Essayer d'utiliser le proxy Tauri d'abord (desktop)
      let proxyPort: number | null = null
      try {
        const port = await safeInvoke('get_proxy_port', {})
        if (port) {
          proxyPort = Number(port)
        }
      } catch {
        // Tauri proxy not available, continue
      }

      if (proxyPort) {
        // Utiliser le proxy Tauri
        await safeInvoke('set_proxy_url', { url: imageUrl })
        proxyUrl = `http://localhost:${proxyPort}/proxy?url=${encodeURIComponent(imageUrl)}`
        // eslint-disable-next-line no-console
        console.log(
          '[ImageContextMenu] Using Tauri proxy to fetch image:',
          proxyUrl
        )
        response = await fetch(proxyUrl)
      } else if (isAndroid) {
        // Utiliser le proxy Java (Android/Capacitor)
        // eslint-disable-next-line no-console
        console.log(
          '[ImageContextMenu] Attempting to start Java proxy server...'
        )

        // Vérifier si le plugin est disponible avant d'appeler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any
        const Plugins = win?.Capacitor?.Plugins || win?.Plugins
        // eslint-disable-next-line no-console
        console.log('[ImageContextMenu] Plugins available:', !!Plugins)
        // eslint-disable-next-line no-console
        console.log(
          '[ImageContextMenu] RawHtml plugin available:',
          !!Plugins?.RawHtml
        )
        // eslint-disable-next-line no-console
        console.log(
          '[ImageContextMenu] startProxyServer method available:',
          typeof Plugins?.RawHtml?.startProxyServer
        )

        const port = await startProxyServer()
        // eslint-disable-next-line no-console
        console.log('[ImageContextMenu] Proxy server port result:', port)

        if (port) {
          proxyUrl = `http://localhost:${port}/proxy?url=${encodeURIComponent(imageUrl)}`
          // eslint-disable-next-line no-console
          console.log(
            '[ImageContextMenu] Using Java proxy to fetch image:',
            proxyUrl
          )
          response = await fetch(proxyUrl)
        } else {
          // eslint-disable-next-line no-console
          console.error(
            '[ImageContextMenu] Proxy server failed to start. Plugins state:',
            {
              Plugins,
              RawHtml: Plugins?.RawHtml,
              startProxyServer: typeof Plugins?.RawHtml?.startProxyServer,
            }
          )
          throw new Error(
            'Proxy server not available. Cannot download image due to CORS restrictions.'
          )
        }
      } else {
        // Web: essayer directement (peut échouer avec CORS)
        // eslint-disable-next-line no-console
        console.warn(
          '[ImageContextMenu] No proxy available, trying direct fetch (may fail with CORS)'
        )
        response = await fetch(imageUrl)
      }

      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`
        )
      }

      const blob = await response.blob()

      // Convertir Blob en base64 en utilisant FileReader (plus fiable pour les grandes images)
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result as string
          // Retirer le préfixe "data:image/...;base64," si présent
          const base64 = result.includes(',') ? result.split(',')[1] : result
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      // Déterminer l'extension du fichier depuis l'URL ou le Content-Type
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      let extension = 'jpg'
      if (contentType.includes('png')) {
        extension = 'png'
      } else if (contentType.includes('gif')) {
        extension = 'gif'
      } else if (contentType.includes('webp')) {
        extension = 'webp'
      } else {
        // Essayer d'extraire l'extension depuis l'URL
        const urlMatch = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)
        if (urlMatch) {
          extension = urlMatch[1].toLowerCase()
        }
      }

      // Générer un nom de fichier unique
      const fileName = `copied_image_${Date.now()}.${extension}`
      const filePath = `shared/${fileName}`

      // Créer le répertoire parent s'il n'existe pas
      try {
        await Filesystem.mkdir({
          path: 'shared',
          directory: Directory.Cache,
          recursive: true,
        })
      } catch (mkdirError) {
        // Le répertoire existe peut-être déjà, continuer
        // eslint-disable-next-line no-console
        console.log(
          '[ImageContextMenu] mkdir result (may already exist):',
          mkdirError
        )
      }

      // Sauvegarder l'image dans le cache de l'app
      await Filesystem.writeFile({
        path: filePath,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      })

      // Obtenir le chemin complet du fichier
      const fileUri = await Filesystem.getUri({
        path: filePath,
        directory: Directory.Cache,
      })

      // Copier l'image dans le presse-papiers via le plugin personnalisé
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any
      const Plugins = win?.Capacitor?.Plugins

      // eslint-disable-next-line no-console
      console.log('[ImageContextMenu] Attempting to copy image:', {
        fileUri: fileUri.uri,
        pluginsAvailable: !!Plugins,
        clipboardPluginAvailable: !!Plugins?.Clipboard,
        copyImageMethodAvailable: !!Plugins?.Clipboard?.copyImage,
      })

      if (Plugins?.Clipboard?.copyImage) {
        try {
          await Plugins.Clipboard.copyImage({
            imagePath: fileUri.uri,
          })
          toast.success('Image copied to clipboard')
        } catch (pluginError) {
          // eslint-disable-next-line no-console
          console.error('[ImageContextMenu] Plugin error:', pluginError)
          throw pluginError
        }
      } else {
        // eslint-disable-next-line no-console
        console.error('[ImageContextMenu] Clipboard plugin not available', {
          Plugins,
          Clipboard: Plugins?.Clipboard,
        })
        throw new Error('Clipboard plugin not available')
      }

      onClose()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[ImageContextMenu] Copy failed:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast.error(`Error copying image: ${errorMessage}`)
      onClose()
    } finally {
      setIsCopying(false)
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
              onClick={handleShare}
              disabled={isSharing}
            >
              <Share2 className='h-4 w-4' />
              <span>{isSharing ? 'Sharing...' : 'Share'}</span>
            </Button>
            <Button
              variant='ghost'
              className='w-full justify-start gap-2'
              onClick={handleCopy}
              disabled={isCopying}
            >
              <Copy className='h-4 w-4' />
              <span>{isCopying ? 'Copying...' : 'Copy'}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Fullscreen image - using fixed div instead of Dialog to allow zoom */}
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
