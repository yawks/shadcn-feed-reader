import { useCallback, useState } from 'react'

import { safeInvoke } from '@/lib/safe-invoke'

interface AuthRequest {
	domain: string
	onSubmit: (username: string, password: string) => void
	onCancel: () => void
}

export function useProxyAuth() {
	const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null)

	const setProxyAuth = useCallback(async (domain: string, username: string, password: string) => {
		// Try Tauri first (desktop)
		try {
			await safeInvoke('set_proxy_auth', { domain, username, password })
			console.log('[useProxyAuth] Set auth for domain (Tauri):', domain)
			return
		} catch (e) {
			console.log('[useProxyAuth] Tauri not available, trying Capacitor')
		}

		// Try Capacitor (Android)
		try {
			const win = window as any
			const Plugins = win?.Capacitor?.Plugins
			if (Plugins?.RawHtml?.setProxyAuth) {
				await Plugins.RawHtml.setProxyAuth({ domain, username, password })
				console.log('[useProxyAuth] Set auth for domain (Capacitor):', domain)
			}
		} catch (e) {
			console.error('[useProxyAuth] Failed to set auth:', e)
		}
	}, [])

	const clearProxyAuth = useCallback(async (domain: string) => {
		// Try Tauri first (desktop)
		try {
			await safeInvoke('clear_proxy_auth', { domain })
			console.log('[useProxyAuth] Cleared auth for domain (Tauri):', domain)
			return
		} catch (e) {
			console.log('[useProxyAuth] Tauri not available, trying Capacitor')
		}

		// Try Capacitor (Android)
		try {
			const win = window as any
			const Plugins = win?.Capacitor?.Plugins
			if (Plugins?.RawHtml?.clearProxyAuth) {
				await Plugins.RawHtml.clearProxyAuth({ domain })
				console.log('[useProxyAuth] Cleared auth for domain (Capacitor):', domain)
			}
		} catch (e) {
			console.error('[useProxyAuth] Failed to clear auth:', e)
		}
	}, [])

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
					console.log('[useProxyAuth] 401 detected, requesting auth for:', json.domain)
					const credentials = await requestAuth(json.domain)
					if (credentials) {
						await setProxyAuth(json.domain, credentials.username, credentials.password)
						return true // Indicates auth was set, caller should retry
					}
				}
			} catch (e) {
				console.error('[useProxyAuth] Failed to parse 401 response:', e)
			}
		}
		return false // No auth required or auth canceled
	}, [requestAuth, setProxyAuth])

	return {
		authRequest,
		setProxyAuth,
		clearProxyAuth,
		checkResponse,
	}
}
