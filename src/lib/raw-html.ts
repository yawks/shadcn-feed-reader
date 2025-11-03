/*
 * Wrapper to obtain raw HTML for a URL from the best available source:
 * 1) Capacitor plugin `RawHtml.fetchRawHtml` (if present in native Android/iOS app)
 * 2) Tauri invoke (if running under Tauri)
 * 3) Fallback to window.fetch (will fail with CORS for most sites)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { safeInvoke } from '@/lib/safe-invoke'

/* eslint-disable no-console */
export async function fetchRawHtml(url: string): Promise<string> {
    console.log('[fetchRawHtml] ===== START ===== url:', url)
    
    // 1) Try Capacitor plugin if available via the global `Capacitor`/`Plugins` object.
    try {
        const win = window as any
        console.log('[fetchRawHtml] Step 1: Checking for Capacitor plugin...')
        console.log('[fetchRawHtml] window.Capacitor exists?', !!win?.Capacitor)
        console.log('[fetchRawHtml] window.Capacitor.Plugins exists?', !!win?.Capacitor?.Plugins)
        
        if (win?.Capacitor?.Plugins) {
            const pluginNames = Object.keys(win.Capacitor.Plugins)
            console.log('[fetchRawHtml] Available plugins:', pluginNames)
            console.log('[fetchRawHtml] RawHtml plugin exists?', !!win.Capacitor.Plugins.RawHtml)
            console.log('[fetchRawHtml] RawHtml.fetchRawHtml is function?', typeof win.Capacitor.Plugins.RawHtml?.fetchRawHtml)
        }
        
        const Plugins = win?.Capacitor?.Plugins || win?.Plugins || undefined
        if (Plugins && Plugins.RawHtml && typeof Plugins.RawHtml.fetchRawHtml === 'function') {
            console.log('[fetchRawHtml] ✓ Calling Capacitor RawHtml plugin for:', url)
            try {
                const res = await Plugins.RawHtml.fetchRawHtml({ url })
                console.log('[fetchRawHtml] ✓ Capacitor plugin SUCCESS, response:', res)
                console.log('[fetchRawHtml] ✓ HTML length:', res?.html?.length || 0)
                return (res && res.html) ? String(res.html) : ''
            } catch (pluginError) {
                console.error('[fetchRawHtml] ✗ Capacitor plugin call FAILED:', pluginError)
                console.error('[fetchRawHtml] ✗ Error name:', pluginError instanceof Error ? pluginError.name : typeof pluginError)
                console.error('[fetchRawHtml] ✗ Error message:', pluginError instanceof Error ? pluginError.message : String(pluginError))
                throw pluginError
            }
        } else {
            console.log('[fetchRawHtml] ✗ Capacitor RawHtml plugin NOT FOUND or NOT a function')
        }
    } catch (e) {
        console.error('[fetchRawHtml] ✗ Capacitor plugin error (outer catch):', e)
        console.error('[fetchRawHtml] ✗ Error type:', typeof e, 'instanceof Error?', e instanceof Error)
        if (e instanceof Error) {
            console.error('[fetchRawHtml] ✗ Error stack:', e.stack)
        }
        // Rethrow to try next fallback
        throw e
    }

    // 2) Try Tauri invoke (if running under Tauri desktop) via safeInvoke
    try {
        console.log('[fetchRawHtml] Step 2: Trying Tauri invoke (safeInvoke) for:', url)
        const html = await safeInvoke('fetch_raw_html', { url })
        console.log('[fetchRawHtml] ✓ Tauri invoke SUCCESS, html length:', String(html ?? '').length)
        return String(html ?? '')
    } catch (e) {
        console.log('[fetchRawHtml] ✗ Tauri invoke FAILED:', e)
        console.log('[fetchRawHtml] ✗ Error message:', e instanceof Error ? e.message : String(e))
    }

    // 3) Fallback to regular fetch (will trigger CORS errors for most sites)
    console.warn('[fetchRawHtml] Step 3: Falling back to regular fetch (may fail with CORS):', url)
    try {
        const res = await fetch(url, { method: 'GET', mode: 'cors' })
        console.log('[fetchRawHtml] Fetch response status:', res.status, res.statusText)
        if (!res.ok) {
            const err = new Error(`Fetch failed: ${res.status} ${res.statusText}`)
            console.error('[fetchRawHtml] ✗ Fetch FAILED:', err)
            throw err
        }
        const text = await res.text()
        console.log('[fetchRawHtml] ✓ Fetch SUCCESS, html length:', text.length)
        return text
    } catch (fetchError) {
        console.error('[fetchRawHtml] ✗ Fetch ERROR:', fetchError)
        console.error('[fetchRawHtml] ✗ Error message:', fetchError instanceof Error ? fetchError.message : String(fetchError))
        throw fetchError
    }
}

export default fetchRawHtml

/**
 * Start the proxy server (Android/Capacitor only)
 * Returns the port number the proxy is listening on
 */
export async function startProxyServer(): Promise<number | null> {
    try {
        const win = window as any
        const Plugins = win?.Capacitor?.Plugins || win?.Plugins || undefined
        if (Plugins && Plugins.RawHtml && typeof Plugins.RawHtml.startProxyServer === 'function') {
            console.log('[startProxyServer] Starting Capacitor proxy server...')
            const res = await Plugins.RawHtml.startProxyServer()
            console.log('[startProxyServer] SUCCESS, port:', res?.port)
            return res?.port || null
        }
        console.log('[startProxyServer] Capacitor plugin not available')
        return null
    } catch (e) {
        console.error('[startProxyServer] ERROR:', e)
        return null
    }
}

/**
 * Set the base URL for the proxy (Android/Capacitor only)
 */
export async function setProxyUrl(url: string): Promise<void> {
    try {
        const win = window as any
        const Plugins = win?.Capacitor?.Plugins || win?.Plugins || undefined
        if (Plugins && Plugins.RawHtml && typeof Plugins.RawHtml.setProxyUrl === 'function') {
            console.log('[setProxyUrl] Setting proxy URL:', url)
            await Plugins.RawHtml.setProxyUrl({ url })
            console.log('[setProxyUrl] SUCCESS')
        }
    } catch (e) {
        console.error('[setProxyUrl] ERROR:', e)
    }
}
