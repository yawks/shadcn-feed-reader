import { getAllStoredDomains, getStoredAuth } from '@/lib/auth-storage'

import { safeInvoke } from '@/lib/safe-invoke'
import { useEffect } from 'react'

/**
 * Provider that loads stored HTTP Basic Auth credentials on app startup
 * and applies them to Tauri/Capacitor proxy
 */
export function ProxyAuthProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		const loadStoredCredentials = async () => {
			const domains = getAllStoredDomains()
			
			if (domains.length === 0) {
				// eslint-disable-next-line no-console
				console.log('[ProxyAuthProvider] No stored credentials found')
				return
			}
			
			// eslint-disable-next-line no-console
			console.log('[ProxyAuthProvider] Loading stored credentials for domains:', domains)
			
			for (const domain of domains) {
				const creds = getStoredAuth(domain)
				if (!creds) continue
				
				// Try Tauri first (desktop)
				try {
					await safeInvoke('set_proxy_auth', { 
						domain, 
						username: creds.username, 
						password: creds.password 
					})
					// eslint-disable-next-line no-console
					console.log('[ProxyAuthProvider] ✓ Set auth for domain (Tauri):', domain)
					continue // Success, move to next domain
				} catch (_e) {
					// Tauri not available, try Capacitor
				}
				
				// Try Capacitor (Android)
				try {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const win = window as any
					const Plugins = win?.Capacitor?.Plugins
					if (Plugins?.RawHtml?.setProxyAuth) {
						await Plugins.RawHtml.setProxyAuth({ 
							domain, 
							username: creds.username, 
							password: creds.password 
						})
						// eslint-disable-next-line no-console
						console.log('[ProxyAuthProvider] ✓ Set auth for domain (Capacitor):', domain)
					}
				} catch (e) {
					// eslint-disable-next-line no-console
					console.error('[ProxyAuthProvider] ✗ Failed to set auth for domain:', domain, e)
				}
			}
		}
		
		loadStoredCredentials()
	}, [])
	
	return <>{children}</>
}
