import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Copy, Maximize2, Share2 } from 'lucide-react'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { startProxyServer } from '@/lib/raw-html'
import { safeInvoke } from '@/lib/safe-invoke'

interface ImageContextMenuProps {
  imageUrl: string | null
  onClose: () => void
}

export function ImageContextMenu({ imageUrl, onClose }: ImageContextMenuProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null)
  const isAndroid = Capacitor.getPlatform() === 'android'

  const handleFullscreen = () => {
    if (!imageUrl) return
    // Store the image URL before closing the menu
    setFullscreenImageUrl(imageUrl)
    // Close the context menu
    onClose()
    // Open the fullscreen dialog immediately
    setIsFullscreenOpen(true)
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
        console.log('[ImageContextMenu] Using Tauri proxy to fetch image:', proxyUrl)
        response = await fetch(proxyUrl)
      } else if (isAndroid) {
        // Utiliser le proxy Java (Android/Capacitor)
        // eslint-disable-next-line no-console
        console.log('[ImageContextMenu] Attempting to start Java proxy server...')
        
        // Vérifier si le plugin est disponible avant d'appeler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any
        const Plugins = win?.Capacitor?.Plugins || win?.Plugins
        // eslint-disable-next-line no-console
        console.log('[ImageContextMenu] Plugins available:', !!Plugins)
        // eslint-disable-next-line no-console
        console.log('[ImageContextMenu] RawHtml plugin available:', !!Plugins?.RawHtml)
        // eslint-disable-next-line no-console
        console.log('[ImageContextMenu] startProxyServer method available:', typeof Plugins?.RawHtml?.startProxyServer)
        
        const port = await startProxyServer()
        // eslint-disable-next-line no-console
        console.log('[ImageContextMenu] Proxy server port result:', port)
        
        if (port) {
          proxyUrl = `http://localhost:${port}/proxy?url=${encodeURIComponent(imageUrl)}`
          // eslint-disable-next-line no-console
          console.log('[ImageContextMenu] Using Java proxy to fetch image:', proxyUrl)
          response = await fetch(proxyUrl)
        } else {
          // eslint-disable-next-line no-console
          console.error('[ImageContextMenu] Proxy server failed to start. Plugins state:', {
            Plugins,
            RawHtml: Plugins?.RawHtml,
            startProxyServer: typeof Plugins?.RawHtml?.startProxyServer,
          })
          throw new Error('Proxy server not available. Cannot download image due to CORS restrictions.')
        }
      } else {
        // Web: essayer directement (peut échouer avec CORS)
        // eslint-disable-next-line no-console
        console.warn('[ImageContextMenu] No proxy available, trying direct fetch (may fail with CORS)')
        response = await fetch(imageUrl)
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
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
        console.log('[ImageContextMenu] mkdir result (may already exist):', mkdirError)
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
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(`Error copying image: ${errorMessage}`)
      onClose()
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <>
      {showContextMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
          <div 
            className="bg-background rounded-lg shadow-lg border p-2 min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={handleFullscreen}
            >
              <Maximize2 className="h-4 w-4" />
              <span>Fullscreen</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={handleShare}
              disabled={isSharing}
            >
              <Share2 className="h-4 w-4" />
              <span>{isSharing ? 'Sharing...' : 'Share'}</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={handleCopy}
              disabled={isCopying}
            >
              <Copy className="h-4 w-4" />
              <span>{isCopying ? 'Copying...' : 'Copy'}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Dialog is always rendered, independent of imageUrl state */}
      <Dialog 
        open={isFullscreenOpen} 
        onOpenChange={(open) => {
          setIsFullscreenOpen(open)
          if (!open) {
            setFullscreenImageUrl(null)
          }
        }}
      >
        <DialogContent 
          className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 bg-black border-0 rounded-none fixed inset-0 top-0 left-0 translate-x-0 translate-y-0 [&>button]:z-[10000] [&>button]:relative"
          overlayClassName="z-[9998]"
          style={{ zIndex: 9999 }}
          onPointerDownOutside={(e) => {
            setIsFullscreenOpen(false)
          }}
          onInteractOutside={(e) => {
            setIsFullscreenOpen(false)
          }}
          onEscapeKeyDown={() => {
            setIsFullscreenOpen(false)
          }}
        >
          <div 
            className="flex items-center justify-center w-full h-full p-4 cursor-pointer"
            onClick={() => setIsFullscreenOpen(false)}
          >
            {fullscreenImageUrl && (
              <img
                src={fullscreenImageUrl}
                alt="Fullscreen image"
                className="max-w-full max-h-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

