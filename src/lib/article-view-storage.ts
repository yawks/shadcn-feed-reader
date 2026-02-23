/**
 * Manages article view preferences (original/readability/dark) per feed
 * Uses localStorage
 */

const STORAGE_KEY = 'article-view-preferences'

export type ArticleViewMode = 'original' | 'readability' | 'configured'

interface ViewPreferences {
	[feedId: string]: ArticleViewMode
}

function getStoredPreferences(): ViewPreferences {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		return stored ? JSON.parse(stored) : {}
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to get stored preferences:', e)
		return {}
	}
}

function savePreferences(prefs: ViewPreferences): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to save preferences:', e)
	}
}

/**
 * Get stored view mode for a feed synchronously, or 'readability' as default
 */
export function getArticleViewModeSync(feedId: number | string): ArticleViewMode {
	try {
		const prefs = getStoredPreferences()
		return prefs[String(feedId)] || 'readability'
	} catch {
		return 'readability'
	}
}

/**
 * Get stored view mode for a feed, or 'readability' as default
 */
export async function getArticleViewMode(feedId: number | string): Promise<ArticleViewMode> {
	try {
		const prefs = getStoredPreferences()
		return prefs[String(feedId)] || 'readability'
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
		const prefs = getStoredPreferences()
		prefs[String(feedId)] = mode
		savePreferences(prefs)
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
		const prefs = getStoredPreferences()
		delete prefs[String(feedId)]
		savePreferences(prefs)
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
		localStorage.removeItem(STORAGE_KEY)
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[article-view-storage] Failed to clear view modes:', e)
	}
}
