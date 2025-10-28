/*
 * Wrapper to obtain raw HTML for a URL from the best available source:
 * 1) Capacitor plugin `RawHtml.fetchRawHtml` (if present in native Android/iOS app)
 * 2) Tauri invoke (if running under Tauri)
 * 3) Fallback to window.fetch (will fail with CORS for most sites)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { invoke as tauriInvoke } from "@tauri-apps/api/core"

/* eslint-disable no-console */
export async function fetchRawHtml(url: string): Promise<string> {
    // 1) Try Capacitor plugin if available via the global `Capacitor`/`Plugins` object.
    try {
        const win = window as any
        console.log('[fetchRawHtml] Checking for Capacitor plugin...')
        console.log('[fetchRawHtml] window.Capacitor:', win?.Capacitor)
        console.log('[fetchRawHtml] window.Capacitor.Plugins:', win?.Capacitor?.Plugins)
        console.log('[fetchRawHtml] Available plugins:', win?.Capacitor?.Plugins ? Object.keys(win.Capacitor.Plugins) : 'none')
        const Plugins = win?.Capacitor?.Plugins || win?.Plugins || undefined
        if (Plugins && Plugins.RawHtml && typeof Plugins.RawHtml.fetchRawHtml === 'function') {
            console.log('[fetchRawHtml] Calling Capacitor RawHtml plugin for:', url)
            const res = await Plugins.RawHtml.fetchRawHtml({ url })
            console.log('[fetchRawHtml] Capacitor plugin returned:', res)
            return (res && res.html) ? String(res.html) : ''
        } else {
            console.log('[fetchRawHtml] Capacitor RawHtml plugin not found')
        }
    } catch (e) {
        console.error('[fetchRawHtml] Capacitor plugin error:', e)
    }

    // 2) Try Tauri invoke (if running under Tauri desktop)
    try {
        console.log('[fetchRawHtml] Trying Tauri invoke for:', url)
        const html = await (tauriInvoke as any)('fetch_raw_html', { url })
        console.log('[fetchRawHtml] Tauri invoke succeeded')
        return String(html ?? '')
    } catch (e) {
        console.log('[fetchRawHtml] Tauri invoke failed:', e)
    }

    // 3) Fallback to regular fetch (will trigger CORS errors for most sites)
    console.warn('[fetchRawHtml] Falling back to regular fetch (may fail with CORS):', url)
    const res = await fetch(url, { method: 'GET', mode: 'cors' })
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return await res.text()
}

export default fetchRawHtml
