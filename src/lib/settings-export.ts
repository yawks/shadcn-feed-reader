/**
 * Export and import application settings
 * Handles localStorage settings backup and restore
 */

import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

// List of localStorage keys to export (excluding sensitive data)
const EXPORTABLE_KEYS = [
	// Authentication (without password)
	'backend-url',
	'backend-login',
	// UI preferences
	'vite-ui-theme',
	'font',
	'fontSize',
	// Article view preferences
	'article-view-preferences',
	// Selector configurations
	'feed-selector-configs',
	// Proxy auth credentials (stored per domain)
	'proxy-auth-credentials',
	// Panel sizes
	'sidebar-width',
	'left-panel-width',
	'right-panel-width',
	'left-panel-flex',
	'right-panel-flex',
	// App settings
	'app-settings',
	// Language
	'lang',
	'i18nextLng',
]

// Keys that should NEVER be exported (security)
const EXCLUDED_KEYS = [
	'backend-password',
	'isAuthenticated',
]

export interface ExportedSettings {
	version: number
	exportedAt: string
	settings: Record<string, string>
}

/**
 * Export all settings from localStorage to a JSON object
 */
export function exportSettings(): ExportedSettings {
	const settings: Record<string, string> = {}

	// Export known keys
	for (const key of EXPORTABLE_KEYS) {
		const value = localStorage.getItem(key)
		if (value !== null) {
			settings[key] = value
		}
	}

	// Also export any other keys that might exist (except excluded ones)
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i)
		if (key && !EXCLUDED_KEYS.includes(key) && !settings[key]) {
			// Include panel resize keys with dynamic names
			if (key.includes('panel') || key.includes('width') || key.includes('flex')) {
				const value = localStorage.getItem(key)
				if (value !== null) {
					settings[key] = value
				}
			}
		}
	}

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		settings,
	}
}

/**
 * Check if running in Tauri environment
 */
async function isTauri(): Promise<boolean> {
	try {
		// Check if __TAURI_INTERNALS__ exists (Tauri v2)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return !!(window as any).__TAURI_INTERNALS__
	} catch {
		return false
	}
}

/**
 * Download settings as a JSON file
 * Uses Tauri dialog API if in Tauri, falls back to browser methods
 */
export async function downloadSettings(): Promise<void> {
	const exported = exportSettings()
	const json = JSON.stringify(exported, null, 2)
	const filename = `feed-reader-settings-${new Date().toISOString().split('T')[0]}.json`

	// eslint-disable-next-line no-console
	console.log('[downloadSettings] Starting export, settings count:', Object.keys(exported.settings).length)

	// Try Tauri dialog API first
	if (await isTauri()) {
		try {
			// eslint-disable-next-line no-console
			console.log('[downloadSettings] Using Tauri dialog API')
			const filePath = await save({
				defaultPath: filename,
				filters: [{
					name: 'JSON Files',
					extensions: ['json'],
				}],
			})

			if (filePath) {
				await writeTextFile(filePath, json)
				// eslint-disable-next-line no-console
				console.log('[downloadSettings] File saved via Tauri:', filePath)
				return
			} else {
				// eslint-disable-next-line no-console
				console.log('[downloadSettings] User cancelled save dialog')
				return
			}
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error('[downloadSettings] Tauri dialog failed:', err)
			throw err
		}
	}

	// Try modern File System Access API (works in Chrome, Edge, etc.)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ('showSaveFilePicker' in window) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const handle = await (window as any).showSaveFilePicker({
				suggestedName: filename,
				types: [{
					description: 'JSON Files',
					accept: { 'application/json': ['.json'] },
				}],
			})
			const writable = await handle.createWritable()
			await writable.write(json)
			await writable.close()
			// eslint-disable-next-line no-console
			console.log('[downloadSettings] File saved via File System Access API')
			return
		} catch (err) {
			// User cancelled or API not supported, fall through to legacy method
			// eslint-disable-next-line no-console
			console.log('[downloadSettings] File System Access API failed, using fallback:', err)
		}
	}

	// Fallback: Create blob and use link with dispatchEvent
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)

	const a = document.createElement('a')
	a.href = url
	a.download = filename

	// Dispatch a real MouseEvent instead of just calling click()
	const event = new MouseEvent('click', {
		view: window,
		bubbles: true,
		cancelable: true,
	})
	a.dispatchEvent(event)

	// eslint-disable-next-line no-console
	console.log('[downloadSettings] Download triggered via MouseEvent')

	// Cleanup after a delay
	setTimeout(() => {
		URL.revokeObjectURL(url)
	}, 1000)
}

/**
 * Validate imported settings structure
 */
export function validateImportedSettings(data: unknown): data is ExportedSettings {
	if (!data || typeof data !== 'object') return false
	const obj = data as Record<string, unknown>
	if (typeof obj.version !== 'number') return false
	if (typeof obj.exportedAt !== 'string') return false
	if (!obj.settings || typeof obj.settings !== 'object') return false
	return true
}

// Keys that need to be stored in Capacitor Preferences on Android
const CAPACITOR_PREFERENCE_KEYS = [
	'article-view-preferences',
	'feed-selector-configs',
]

/**
 * Check if we're running on Android/Capacitor
 */
function isCapacitor(): boolean {
	return typeof window !== 'undefined' &&
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).Capacitor?.getPlatform?.() === 'android'
}

/**
 * Import settings from a JSON object
 * @param data The exported settings object
 * @param skipAuth If true, don't import backend-url and backend-login (useful when already on login page)
 */
export async function importSettings(data: ExportedSettings, skipAuth = false): Promise<void> {
	// On Android, we need to use Capacitor Preferences for certain keys
	const useCapacitorPreferences = isCapacitor()

	// eslint-disable-next-line no-console
	console.log('[importSettings] Starting import, useCapacitorPreferences:', useCapacitorPreferences)

	for (const [key, value] of Object.entries(data.settings)) {
		// Never import excluded keys
		if (EXCLUDED_KEYS.includes(key)) continue

		// Skip auth keys if requested
		if (skipAuth && (key === 'backend-url' || key === 'backend-login')) continue

		// On Android, certain keys need to be stored in Capacitor Preferences
		if (useCapacitorPreferences && CAPACITOR_PREFERENCE_KEYS.includes(key)) {
			try {
				const { Preferences } = await import('@capacitor/preferences')
				await Preferences.set({ key, value })
				// eslint-disable-next-line no-console
				console.log(`[importSettings] Stored "${key}" in Capacitor Preferences`)
			} catch (err) {
				// eslint-disable-next-line no-console
				console.error(`[importSettings] Failed to store "${key}" in Capacitor Preferences:`, err)
			}
		} else {
			localStorage.setItem(key, value)
			// eslint-disable-next-line no-console
			console.log(`[importSettings] Stored "${key}" in localStorage`)
		}
	}

	// eslint-disable-next-line no-console
	console.log('[importSettings] Import completed')
}

/**
 * Read a file and parse it as ExportedSettings
 */
export function readSettingsFile(file: File): Promise<ExportedSettings> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = (e) => {
			try {
				const content = e.target?.result as string
				const data = JSON.parse(content)
				if (!validateImportedSettings(data)) {
					reject(new Error('Invalid settings file format'))
					return
				}
				resolve(data)
			} catch (err) {
				reject(new Error('Failed to parse settings file'))
			}
		}
		reader.onerror = () => reject(new Error('Failed to read file'))
		reader.readAsText(file)
	})
}

/**
 * Get pre-filled login data from imported settings
 */
export function getImportedLoginData(data: ExportedSettings): { url?: string; login?: string } {
	return {
		url: data.settings['backend-url'],
		login: data.settings['backend-login'],
	}
}
