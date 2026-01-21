/**
 * Persistent storage for HTTP Basic Auth credentials.
 * Stores credentials by domain (scheme://host[:port]) in localStorage.
 * 
 * Security note: localStorage is not the most secure storage, but it's
 * acceptable for this use case since it's equivalent to browser's built-in
 * HTTP Basic Auth credential storage.
 */

const STORAGE_KEY = 'proxy-auth-credentials'

export interface StoredCredentials {
	username: string
	password: string
	/** ISO timestamp when credentials were last used successfully */
	lastUsed?: string
}

type CredentialsMap = Record<string, StoredCredentials>

/**
 * Extract domain from URL (scheme://host[:port])
 * @example extractDomain('https://example.com/path') => 'https://example.com'
 * @example extractDomain('http://example.com:8080/path') => 'http://example.com:8080'
 */
export function extractDomain(url: string): string {
	try {
		const urlObj = new URL(url)
		let domain = `${urlObj.protocol}//${urlObj.hostname}`
		if (urlObj.port && urlObj.port !== '80' && urlObj.port !== '443') {
			domain += `:${urlObj.port}`
		}
		return domain
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[auth-storage] Invalid URL:', url, e)
		return url // fallback to original string
	}
}

/**
 * Load all stored credentials from localStorage
 */
function loadCredentials(): CredentialsMap {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (!stored) return {}
		return JSON.parse(stored) as CredentialsMap
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[auth-storage] Failed to load credentials:', e)
		return {}
	}
}

/**
 * Save credentials map to localStorage
 */
function saveCredentials(credentials: CredentialsMap): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[auth-storage] Failed to save credentials:', e)
	}
}

/**
 * Get stored credentials for a domain or URL
 * @param domainOrUrl - Domain or full URL (will extract domain)
 * @returns Stored credentials or null if not found
 */
export function getStoredAuth(domainOrUrl: string): StoredCredentials | null {
	const domain = extractDomain(domainOrUrl)
	const all = loadCredentials()
	return all[domain] || null
}

/**
 * Store credentials for a domain or URL
 * @param domainOrUrl - Domain or full URL (will extract domain)
 * @param username - Username
 * @param password - Password
 */
export function storeAuth(domainOrUrl: string, username: string, password: string): void {
	const domain = extractDomain(domainOrUrl)
	const all = loadCredentials()
	all[domain] = {
		username,
		password,
		lastUsed: new Date().toISOString(),
	}
	saveCredentials(all)
	// eslint-disable-next-line no-console
	console.log('[auth-storage] Stored credentials for domain:', domain)
}

/**
 * Remove stored credentials for a domain or URL
 * @param domainOrUrl - Domain or full URL (will extract domain)
 */
export function removeStoredAuth(domainOrUrl: string): void {
	const domain = extractDomain(domainOrUrl)
	const all = loadCredentials()
	delete all[domain]
	saveCredentials(all)
	// eslint-disable-next-line no-console
	console.log('[auth-storage] Removed credentials for domain:', domain)
}

/**
 * Get all stored domains (for debugging/management UI)
 */
export function getAllStoredDomains(): string[] {
	const all = loadCredentials()
	return Object.keys(all)
}

/**
 * Clear all stored credentials (for logout/reset)
 */
export function clearAllStoredAuth(): void {
	localStorage.removeItem(STORAGE_KEY)
	// eslint-disable-next-line no-console
	console.log('[auth-storage] Cleared all credentials')
}
