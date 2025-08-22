import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, Monitor, Smartphone, Wifi } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export function PWAInfo() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isAndroid = /Android/.test(navigator.userAgent)

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Progressive Web App (PWA)
        </CardTitle>
        <CardDescription>
          This application is configured as a PWA for an optimal experience
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              <span className="text-sm font-medium">Mode d'affichage</span>
            </div>
            <Badge variant={isStandalone ? "default" : "secondary"}>
              {isStandalone ? "Application installée" : "Navigateur web"}
            </Badge>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              <span className="text-sm font-medium">Offline operation</span>
            </div>
            <Badge variant="default">Enabled</Badge>
          </div>
        </div>

        {!isStandalone && (
          <div className="space-y-3 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Install this app on your device for a better experience:
            </p>
            
            <div className="space-y-2">
              {isAndroid && (
                <div className="flex items-center gap-2 text-sm">
                  <Download className="h-4 w-4" />
                  <span>Chrome: Menu → “Add to Home Screen”</span>
                </div>
              )}
              
              {isIOS && (
                <div className="flex items-center gap-2 text-sm">
                  <Download className="h-4 w-4" />
                  <span>Safari: Partager → “Add to Home Screen”</span>
                </div>
              )}
              
              {!isAndroid && !isIOS && (
                <div className="flex items-center gap-2 text-sm">
                  <Download className="h-4 w-4" />
                  <span>Desktop: Installation icon in the address bar</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
