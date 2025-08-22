import { RefreshCw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function OfflinePage() {
  const handleRetry = () => {
    window.location.reload()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex justify-center">
          <WifiOff className="h-16 w-16 text-muted-foreground" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Vous êtes hors ligne</h1>
          <p className="text-muted-foreground">
            Votre connexion internet semble indisponible. Certaines fonctionnalités peuvent ne pas être accessibles.
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            L'application fonctionne en mode hors ligne avec les données en cache.
          </p>
          
          <Button onClick={handleRetry} className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    </div>
  )
}
