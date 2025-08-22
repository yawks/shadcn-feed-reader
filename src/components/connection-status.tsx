import { Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { useOnlineStatus } from '@/hooks/use-online-status'

export function ConnectionStatus() {
  const isOnline = useOnlineStatus()
  const [showStatus, setShowStatus] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setShowStatus(true)
    } else {
      // Afficher brièvement le statut "en ligne" quand la connexion est rétablie
      setShowStatus(true)
      const timer = setTimeout(() => setShowStatus(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [isOnline])

  if (!showStatus) return null

  return (
    <div className="fixed top-4 right-4 z-50">
      <Badge 
        variant={isOnline ? "default" : "destructive"}
        className="flex items-center gap-2"
      >
        {isOnline ? (
          <>
            <Wifi className="h-3 w-3" />
            En ligne
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            Hors ligne
          </>
        )}
      </Badge>
    </div>
  )
}
