/**
 * Manages CSS selector configurations per feed
 * Uses localStorage
 */

import type { FeedSelectorConfig, FeedAuthConfig, StoredAuthConfig, SelectorConfigStorage } from '@/features/feeds/selector-config-types'
import { encryptPassword, decryptPassword, getBackendPassword } from './encryption'

const STORAGE_KEY = 'feed-selector-configs'

function getStoredConfigs(): SelectorConfigStorage {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		return stored ? JSON.parse(stored) : {}
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[selector-config-storage] Failed to get stored configs:', e)
		return {}
	}
}

function saveConfigs(configs: SelectorConfigStorage): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[selector-config-storage] Failed to save configs:', e)
	}
}

/**
 * Get selector config for a feed (async)
 */
export async function getSelectorConfig(feedId: string): Promise<FeedSelectorConfig | null> {
	try {
		const configs = getStoredConfigs()
		return configs[feedId] || null
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[selector-config-storage] Failed to get config:', e)
		return null
	}
}

/**
 * Get selector config for a feed synchronously
 */
export function getSelectorConfigSync(feedId: string): FeedSelectorConfig | null {
	try {
		const configs = getStoredConfigs()
		return configs[feedId] || null
	} catch {
		return null
	}
}

/**
 * Save selector config for a feed
 */
export async function setSelectorConfig(feedId: string, config: FeedSelectorConfig): Promise<void> {
	try {
		const configs = getStoredConfigs()
		configs[feedId] = config
		saveConfigs(configs)
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[selector-config-storage] Failed to set config:', e)
	}
}

/**
 * Remove selector config for a feed
 */
export async function removeSelectorConfig(feedId: string): Promise<void> {
	try {
		const configs = getStoredConfigs()
		delete configs[feedId]
		saveConfigs(configs)
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[selector-config-storage] Failed to remove config:', e)
	}
}

/**
 * Check if a feed has configured selectors, custom CSS, or auth config (async)
 */
export async function hasSelectorConfig(feedId: string): Promise<boolean> {
	try {
		const configs = getStoredConfigs()
		const config = configs[feedId]
		return config != null && (config.selectors.length > 0 || !!config.customCss || !!config.authConfig)
	} catch {
		return false
	}
}

/**
 * Check synchronously
 */
export function hasSelectorConfigSync(feedId: string): boolean {
	try {
		const configs = getStoredConfigs()
		const config = configs[feedId]
		return config != null && (config.selectors.length > 0 || !!config.customCss || !!config.authConfig)
	} catch {
		return false
	}
}

/**
 * Generate a unique ID for a selector item
 */
export function generateSelectorId(): string {
	return `sel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ============================================================================
// Authentication Configuration Functions
// ============================================================================

/**
 * Get auth config for a feed, decrypting the password
 */
export async function getAuthConfig(feedId: string): Promise<FeedAuthConfig | null> {
	try {
		const config = await getSelectorConfig(feedId)
		if (!config?.authConfig) return null

		const { encrypted, ...authConfigRest } = config.authConfig

		// Decrypt password
		const masterPassword = getBackendPassword()
		if (!masterPassword) {
			// eslint-disable-next-line no-console
			console.warn('[selector-config-storage] Cannot decrypt auth config: no backend password')
			return null
		}

		try {
			const password = await decryptPassword(
				encrypted.encryptedPassword,
				encrypted.iv,
				encrypted.salt,
				masterPassword
			)

			return {
				...authConfigRest,
				password,
			}
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error('[selector-config-storage] Failed to decrypt password:', e)
			return null
		}
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[selector-config-storage] Failed to get auth config:', e)
		return null
	}
}

/**
 * Check if a feed has auth config (async)
 */
export async function hasAuthConfig(feedId: string): Promise<boolean> {
	try {
		const configs = getStoredConfigs()
		const config = configs[feedId]
		return config?.authConfig?.loginUrl != null
	} catch {
		return false
	}
}

/**
 * Check if a feed has auth config synchronously
 */
export function hasAuthConfigSync(feedId: string): boolean {
	try {
		const configs = getStoredConfigs()
		const config = configs[feedId]
		return config?.authConfig?.loginUrl != null
	} catch {
		return false
	}
}

/**
 * Save auth config for a feed, encrypting the password
 */
export async function setAuthConfig(feedId: string, authConfig: FeedAuthConfig): Promise<void> {
	const masterPassword = getBackendPassword()
	if (!masterPassword) {
		throw new Error('Backend password required for encryption')
	}

	// Encrypt the password
	const encrypted = await encryptPassword(authConfig.password, masterPassword)

	// Build stored auth config (without plaintext password)
	const storedAuthConfig: StoredAuthConfig = {
		loginUrl: authConfig.loginUrl,
		usernameField: authConfig.usernameField,
		passwordField: authConfig.passwordField,
		username: authConfig.username,
		extraFields: authConfig.extraFields,
		responseSelector: authConfig.responseSelector,
		logoutUrl: authConfig.logoutUrl,
		encrypted,
	}

	// Get existing config or create new one
	const existingConfig = await getSelectorConfig(feedId)
	const config: FeedSelectorConfig = existingConfig || {
		feedId,
		selectors: [],
		updatedAt: new Date().toISOString(),
	}

	// Update auth config
	config.authConfig = storedAuthConfig
	config.updatedAt = new Date().toISOString()

	await setSelectorConfig(feedId, config)
}

/**
 * Remove auth config for a feed
 */
export async function removeAuthConfig(feedId: string): Promise<void> {
	try {
		const config = await getSelectorConfig(feedId)
		if (!config) return

		delete config.authConfig
		config.updatedAt = new Date().toISOString()

		await setSelectorConfig(feedId, config)
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[selector-config-storage] Failed to remove auth config:', e)
	}
}
