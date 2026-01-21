/**
 * Manages article view preferences (original/readability/dark) per feed
 * Uses Capacitor Preferences API on Android, localStorage elsewhere
 */

import { Preferences } from '@capacitor/preferences'

const STORAGE_KEY = 'article-view-preferences'

export type ArticleViewMode = 'original' | 'readability' | 'configured'

interface ViewPreferences {
	[feedId: string]: ArticleViewMode
}

/**
 * Check if we're running on Android/Capacitor
 */
function isCapacitor(): boolean {
	return typeof window !== 'undefined' && 
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).Capacitor?.getPlatform?.() === 'android'
}

/**
 * Get stored preferences from storage (synchronous version for initial state)
 */
function getStoredPreferencesSync(): ViewPreferences {
	try {
		if (typeof window !== 'undefined' && !isCapacitor()) {
			// Use localStorage on desktop/web (synchronous)
			const stored = localStorage.getItem(STORAGE_KEY)
			return stored ? JSON.parse(stored) : {}
		}
	} catch {
		// Ignore errors
	}
	return {}
}

/**
 * Get stored preferences from storage (async version for Capacitor)
 */
async function getStoredPreferences(): Promise<ViewPreferences> {
	try {
		if (isCapacitor()) {
			// Use Capacitor Preferences API on Android
			const { value } = await Preferences.get({ key: STORAGE_KEY })
			// eslint-disable-next-line no-console
			console.log(`[article-view-storage] Getting from Capacitor Preferences, value:`, value)
			return value ? JSON.parse(value) : {}
		} else {
			// Use localStorage on desktop/web
			const stored = localStorage.getItem(STORAGE_KEY)
			return stored ? JSON.parse(stored) : {}
		}
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to get stored preferences:', e)
		return {}
	}
}

/**
 * Save preferences to storage
 */
async function savePreferences(prefs: ViewPreferences): Promise<void> {
	try {
		const json = JSON.stringify(prefs)
		if (isCapacitor()) {
			// Use Capacitor Preferences API on Android
			await Preferences.set({ key: STORAGE_KEY, value: json })
			// eslint-disable-next-line no-console
			console.log(`[article-view-storage] Saved to Capacitor Preferences`)
		} else {
			// Use localStorage on desktop/web
			localStorage.setItem(STORAGE_KEY, json)
			// eslint-disable-next-line no-console
			console.log(`[article-view-storage] Saved to localStorage`)
		}
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to save preferences:', e)
	}
}

/**
 * Get stored view mode for a feed synchronously (for initial state)
 * Returns 'readability' if not found or on Capacitor (where we need async)
 */
export function getArticleViewModeSync(feedId: number | string): ArticleViewMode {
	try {
		if (isCapacitor()) {
			// On Capacitor, can't load synchronously, return default
			return 'readability'
		}
		const prefs = getStoredPreferencesSync()
		const mode = prefs[String(feedId)] || 'readability'
		return mode
	} catch {
		return 'readability'
	}
}

/**
 * Get stored view mode for a feed, or 'readability' as default
 */
export async function getArticleViewMode(feedId: number | string): Promise<ArticleViewMode> {
	try {
		// eslint-disable-next-line no-console
		console.log(`[article-view-storage] Getting view mode for feed ${feedId}`)
		const prefs = await getStoredPreferences()
		const mode = prefs[String(feedId)] || 'readability'
		// eslint-disable-next-line no-console
		console.log(`[article-view-storage] Found view mode "${mode}" for feed ${feedId}`)
		return mode
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to get view mode:', e)
		return 'readability'
	}
}

/**
 * Store view mode preference for a feed
 */
export async function setArticleViewMode(feedId: number | string, mode: ArticleViewMode): Promise<void> {
	try {
		// eslint-disable-next-line no-console
		console.log(`[article-view-storage] Storing view mode "${mode}" for feed ${feedId}`)
		const prefs = await getStoredPreferences()
		prefs[String(feedId)] = mode
		await savePreferences(prefs)
		// eslint-disable-next-line no-console
		console.log(`[article-view-storage] Stored view mode "${mode}" for feed ${feedId}`)
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to store view mode:', e)
	}
}

/**
 * Remove view mode preference for a feed
 */
export async function removeArticleViewMode(feedId: number | string): Promise<void> {
	try {
		const prefs = await getStoredPreferences()
		delete prefs[String(feedId)]
		await savePreferences(prefs)
		// eslint-disable-next-line no-console
		console.log(`[article-view-storage] Removed view mode for feed ${feedId}`)
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to remove view mode:', e)
	}
}

/**
 * Clear all view mode preferences
 */
export async function clearAllArticleViewModes(): Promise<void> {
	try {
		if (isCapacitor()) {
			await Preferences.remove({ key: STORAGE_KEY })
		} else {
			localStorage.removeItem(STORAGE_KEY)
		}
		// eslint-disable-next-line no-console
		console.log('[article-view-storage] Cleared all view modes')
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to clear view modes:', e)
	}
}
