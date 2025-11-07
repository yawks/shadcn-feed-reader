import { getAllStoredDomains, getStoredAuth, removeStoredAuth, storeAuth } from '@/lib/auth-storage'
import { useCallback, useEffect, useState } from 'react'

import { safeInvoke } from '@/lib/safe-invoke'

interface AuthRequest {
	domain: string
	onSubmit: (username: string, password: string) => void
	onCancel: () => void
}

export function useProxyAuth() {
	const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null)

	const setProxyAuth = useCallback(async (domain: string, username: string, password: string, saveToStorage = true) => {
		// Save to localStorage if requested
		if (saveToStorage) {
			storeAuth(domain, username, password)
		}
		
		// Try Tauri first (desktop)
		try {
			await safeInvoke('set_proxy_auth', { domain, username, password })
			// eslint-disable-next-line no-console
			console.log('[useProxyAuth] Set auth for domain (Tauri):', domain)
			return
		} catch (_e) {
			// eslint-disable-next-line no-console
			console.log('[useProxyAuth] Tauri not available, trying Capacitor')
		}

		// Try Capacitor (Android)
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const win = window as any
			const Plugins = win?.Capacitor?.Plugins
			if (Plugins?.RawHtml?.setProxyAuth) {
				await Plugins.RawHtml.setProxyAuth({ domain, username, password })
				// eslint-disable-next-line no-console
				console.log('[useProxyAuth] Set auth for domain (Capacitor):', domain)
			}
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error('[useProxyAuth] Failed to set auth:', e)
		}
	}, [])

	const clearProxyAuth = useCallback(async (domain: string, removeFromStorage = true) => {
		// Remove from localStorage if requested
		if (removeFromStorage) {
			removeStoredAuth(domain)
		}
		
		// Try Tauri first (desktop)
		try {
			await safeInvoke('clear_proxy_auth', { domain })
			// eslint-disable-next-line no-console
			console.log('[useProxyAuth] Cleared auth for domain (Tauri):', domain)
			return
		} catch (_e) {
			// eslint-disable-next-line no-console
			console.log('[useProxyAuth] Tauri not available, trying Capacitor')
		}

		// Try Capacitor (Android)
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const win = window as any
			const Plugins = win?.Capacitor?.Plugins
			if (Plugins?.RawHtml?.clearProxyAuth) {
				await Plugins.RawHtml.clearProxyAuth({ domain })
				// eslint-disable-next-line no-console
				console.log('[useProxyAuth] Cleared auth for domain (Capacitor):', domain)
			}
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error('[useProxyAuth] Failed to clear auth:', e)
		}
	}, [])

	// Load stored credentials on mount
	useEffect(() => {
		const loadCredentials = async () => {
			const domains = getAllStoredDomains()
			// eslint-disable-next-line no-console
			console.log('[useProxyAuth] Loading stored credentials for domains:', domains)
			
			for (const domain of domains) {
				const creds = getStoredAuth(domain)
				if (creds) {
					// Apply stored credentials (don't re-save to storage)
					await setProxyAuth(domain, creds.username, creds.password, false)
				}
			}
		}
		
		loadCredentials()
	}, [setProxyAuth])

	const requestAuth = useCallback((domain: string): Promise<{ username: string; password: string } | null> => {
		return new Promise((resolve) => {
			setAuthRequest({
				domain,
				onSubmit: (username, password) => {
					setAuthRequest(null)
					resolve({ username, password })
				},
				onCancel: () => {
					setAuthRequest(null)
					resolve(null)
				},
			})
		})
	}, [])

	const checkResponse = useCallback(async (response: Response): Promise<boolean> => {
		if (response.status === 401) {
			try {
				const json = await response.json()
				if (json.error === 'auth_required' && json.domain) {
					// eslint-disable-next-line no-console
					console.log('[useProxyAuth] 401 detected for:', json.domain)
					
					// Check if we have stored credentials that might be invalid
					const storedCreds = getStoredAuth(json.domain)
					if (storedCreds) {
						// eslint-disable-next-line no-console
						console.log('[useProxyAuth] Stored credentials invalid, removing and requesting new auth')
						// Clear invalid credentials
						await clearProxyAuth(json.domain, true)
					}
					
					// Request new credentials from user
					const credentials = await requestAuth(json.domain)
					if (credentials) {
						await setProxyAuth(json.domain, credentials.username, credentials.password, true)
						return true // Indicates auth was set, caller should retry
					}
				}
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error('[useProxyAuth] Failed to parse 401 response:', e)
			}
		}
		return false // No auth required or auth canceled
	}, [requestAuth, setProxyAuth, clearProxyAuth])

	return {
		authRequest,
		setProxyAuth,
		clearProxyAuth,
		checkResponse,
	}
}
