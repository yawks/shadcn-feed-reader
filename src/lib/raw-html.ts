/*
 * Wrapper to obtain raw HTML for a URL from the best available source:
 * 1) Capacitor plugin `RawHtml.fetchRawHtml` (if present in native Android/iOS app)
 * 2) Tauri invoke (if running under Tauri)
 * 3) Fallback to window.fetch (will fail with CORS for most sites)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { safeInvoke } from '@/lib/safe-invoke'

export class AuthRequiredError extends Error {
    constructor(public domain: string) {
        super(`Authentication required for ${domain}`)
        this.name = 'AuthRequiredError'
    }
}

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
            } catch (pluginError: any) {
                console.error('[fetchRawHtml] ✗ Capacitor plugin call FAILED:', pluginError)
                console.error('[fetchRawHtml] ✗ Error name:', pluginError instanceof Error ? pluginError.name : typeof pluginError)
                console.error('[fetchRawHtml] ✗ Error message:', pluginError instanceof Error ? pluginError.message : String(pluginError))
                
                // Check if it's an auth required error
                if (pluginError?.message?.includes('AUTH_REQUIRED') || pluginError?.code === 'AUTH_REQUIRED') {
                    // Extract domain from error data or URL
                    const domain = pluginError?.data?.domain || new URL(url).origin
                    console.log('[fetchRawHtml] ✗ Auth required for domain:', domain)
                    throw new AuthRequiredError(domain)
                }
                
                throw pluginError
            }
        } else {
            console.log('[fetchRawHtml] ✗ Capacitor RawHtml plugin NOT FOUND or NOT a function')
        }
    } catch (e) {
        // If it's an AuthRequiredError, rethrow immediately (don't try other methods)
        if (e instanceof AuthRequiredError) {
            throw e
        }
        
        console.error('[fetchRawHtml] ✗ Capacitor plugin error (outer catch):', e)
        console.error('[fetchRawHtml] ✗ Error type:', typeof e, 'instanceof Error?', e instanceof Error)
        if (e instanceof Error) {
            console.error('[fetchRawHtml] ✗ Error stack:', e.stack)
        }
        // For other errors, continue to try Tauri (don't rethrow yet)
        console.log('[fetchRawHtml] ✗ Capacitor failed, will try Tauri next')
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
        
        const errorMsg = e instanceof Error ? e.message : String(e)
        
        // Check if it's an auth required error
        if (errorMsg.includes('AUTH_REQUIRED:')) {
            // Extract domain from error message (format: "AUTH_REQUIRED:https://example.com")
            const domain = errorMsg.split('AUTH_REQUIRED:')[1]?.trim() || new URL(url).origin
            console.log('[fetchRawHtml] ✗ Auth required for domain:', domain)
            throw new AuthRequiredError(domain)
        }
        
        // If Tauri is not available at all, continue to fallback fetch (step 3)
        if (errorMsg.includes('Tauri invoke not available')) {
            console.log('[fetchRawHtml] → Tauri not available, continuing to step 3 (fallback fetch)')
            // Fall through to step 3
        } else {
            // If it's any other Tauri error (Tauri IS available but request failed),
            // don't fallback to regular fetch - rethrow
            console.log('[fetchRawHtml] ✗ Re-throwing Tauri error (no fallback)')
            throw e
        }
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
            // eslint-disable-next-line no-console
            console.log('[startProxyServer] Calling Capacitor startProxyServer...')
            try {
                const res = await Plugins.RawHtml.startProxyServer()
                // eslint-disable-next-line no-console
                console.log('[startProxyServer] Response:', JSON.stringify(res))
                const port = res?.port || res?.value || (typeof res === 'number' ? res : null)
                if (port) {
                    // eslint-disable-next-line no-console
                    console.log('[startProxyServer] SUCCESS, port:', port)
                    return port
                } else {
                    // eslint-disable-next-line no-console
                    console.warn('[startProxyServer] Response received but no port found:', res)
                    return null
                }
            } catch (pluginError) {
                // eslint-disable-next-line no-console
                console.error('[startProxyServer] Plugin call failed:', pluginError)
                // Le plugin Java vérifie déjà si le proxy est en cours et retourne le port existant
                // Si on arrive ici, c'est une vraie erreur (ex: IOException)
                throw pluginError
            }
        }
        // eslint-disable-next-line no-console
        console.log('[startProxyServer] Capacitor plugin not available', {
            Plugins: !!Plugins,
            RawHtml: !!Plugins?.RawHtml,
            startProxyServer: typeof Plugins?.RawHtml?.startProxyServer,
        })
        return null
    } catch (e) {
        // eslint-disable-next-line no-console
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

/**
 * Set HTTP Basic Auth credentials for a domain (Android/Capacitor only)
 */
export async function setProxyAuth(domain: string, username: string, password: string): Promise<void> {
    try {
        const win = window as any
        const Plugins = win?.Capacitor?.Plugins || win?.Plugins || undefined
        if (Plugins && Plugins.RawHtml && typeof Plugins.RawHtml.setProxyAuth === 'function') {
            console.log('[setProxyAuth] Setting auth for domain:', domain)
            await Plugins.RawHtml.setProxyAuth({ domain, username, password })
            console.log('[setProxyAuth] SUCCESS')
        }
    } catch (e) {
        console.error('[setProxyAuth] ERROR:', e)
    }
}

/**
 * Clear HTTP Basic Auth credentials for a domain (Android/Capacitor only)
 */
export async function clearProxyAuth(domain: string): Promise<void> {
    try {
        const win = window as any
        const Plugins = win?.Capacitor?.Plugins || win?.Plugins || undefined
        if (Plugins && Plugins.RawHtml && typeof Plugins.RawHtml.clearProxyAuth === 'function') {
            console.log('[clearProxyAuth] Clearing auth for domain:', domain)
            await Plugins.RawHtml.clearProxyAuth({ domain })
            console.log('[clearProxyAuth] SUCCESS')
        }
    } catch (e) {
        console.error('[clearProxyAuth] ERROR:', e)
    }
}

/**
 * Form login request for site authentication
 */
export interface FormLoginRequest {
    loginUrl: string
    fields: Array<{ name: string; value: string }>
    /** Optional CSS selector to extract text from login response */
    responseSelector?: string
}

/**
 * Form login response
 */
export interface FormLoginResponse {
    success: boolean
    statusCode: number
    message: string
    /** Text extracted from the response using responseSelector */
    extractedText?: string
}

/**
 * Perform form-based login to a website (Android/Capacitor only)
 * The cookies from the login will be stored and used for subsequent requests.
 */
export async function performFormLogin(request: FormLoginRequest): Promise<FormLoginResponse> {
    const win = window as any
    const Plugins = win?.Capacitor?.Plugins || win?.Plugins || undefined

    if (Plugins && Plugins.RawHtml && typeof Plugins.RawHtml.performFormLogin === 'function') {
        console.log('[performFormLogin] Calling Capacitor performFormLogin for:', request.loginUrl)
        try {
            const res = await Plugins.RawHtml.performFormLogin({
                loginUrl: request.loginUrl,
                fields: request.fields,
                responseSelector: request.responseSelector,
            })
            console.log('[performFormLogin] SUCCESS, response:', res)
            return {
                success: res?.success ?? false,
                statusCode: res?.statusCode ?? 0,
                message: res?.message ?? 'Unknown response',
                extractedText: res?.extractedText,
            }
        } catch (e) {
            console.error('[performFormLogin] ERROR:', e)
            throw e
        }
    }

    // If Capacitor plugin is not available, throw
    throw new Error('performFormLogin not available: Capacitor plugin not found')
}
