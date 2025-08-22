import { toast } from 'sonner'
import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PWAPrompt() {
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      // eslint-disable-next-line no-console
      console.log('SW Registered: ', r)
    },
    onRegisterError(error: unknown) {
      // eslint-disable-next-line no-console
      console.log('SW registration error', error)
    },
  })

  useEffect(() => {
    if (offlineReady) {
      toast.success('Application prête pour une utilisation hors ligne', {
        duration: 5000,
      })
    }
  }, [offlineReady])

  useEffect(() => {
    if (needRefresh) {
      toast('Nouvelle version disponible', {
        description: 'Cliquez pour mettre à jour',
        action: {
          label: 'Mettre à jour',
          onClick: () => updateServiceWorker(true),
        },
        duration: 0, // Ne pas fermer automatiquement
      })
    }
  }, [needRefresh, updateServiceWorker])

  return null
}
