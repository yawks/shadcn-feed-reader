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
		if (saveToStorage) {
			storeAuth(domain, username, password)
		}

		try {
			await safeInvoke('set_proxy_auth', { domain, username, password })
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error('[useProxyAuth] Failed to set auth:', e)
		}
	}, [])

	const clearProxyAuth = useCallback(async (domain: string, removeFromStorage = true) => {
		if (removeFromStorage) {
			removeStoredAuth(domain)
		}

		try {
			await safeInvoke('clear_proxy_auth', { domain })
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error('[useProxyAuth] Failed to clear auth:', e)
		}
	}, [])

	// Load stored credentials on mount
	useEffect(() => {
		const loadCredentials = async () => {
			const domains = getAllStoredDomains()
			for (const domain of domains) {
				const creds = getStoredAuth(domain)
				if (creds) {
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
					const storedCreds = getStoredAuth(json.domain)
					if (storedCreds) {
						await clearProxyAuth(json.domain, true)
					}

					const credentials = await requestAuth(json.domain)
					if (credentials) {
						await setProxyAuth(json.domain, credentials.username, credentials.password, true)
						return true
					}
				}
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error('[useProxyAuth] Failed to parse 401 response:', e)
			}
		}
		return false
	}, [requestAuth, setProxyAuth, clearProxyAuth])

	return {
		authRequest,
		setProxyAuth,
		clearProxyAuth,
		checkResponse,
	}
}
