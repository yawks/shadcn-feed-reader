import { getAllStoredDomains, getStoredAuth } from '@/lib/auth-storage'

import { safeInvoke } from '@/lib/safe-invoke'
import { useEffect } from 'react'

/**
 * Provider that loads stored HTTP Basic Auth credentials on app startup
 * and applies them to the Tauri proxy
 */
export function ProxyAuthProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		const loadStoredCredentials = async () => {
			const domains = getAllStoredDomains()

			if (domains.length === 0) return

			for (const domain of domains) {
				const creds = getStoredAuth(domain)
				if (!creds) continue

				try {
					await safeInvoke('set_proxy_auth', {
						domain,
						username: creds.username,
						password: creds.password,
					})
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
