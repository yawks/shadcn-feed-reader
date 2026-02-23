/*
 * Wrapper to obtain raw HTML for a URL from the best available source:
 * 1) Tauri invoke (if running under Tauri)
 * 2) HTTP API (Docker/Web mode)
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

    // 1) Try Tauri invoke (if running under Tauri desktop) via safeInvoke
    try {
        console.log('[fetchRawHtml] Step 1: Trying Tauri/HTTP invoke (safeInvoke) for:', url)
        const html = await safeInvoke('fetch_raw_html', { url })
        console.log('[fetchRawHtml] ✓ Tauri/HTTP invoke SUCCESS, html length:', String(html ?? '').length)
        return String(html ?? '')
    } catch (e) {
        console.log('[fetchRawHtml] ✗ Tauri/HTTP invoke FAILED:', e)
        console.log('[fetchRawHtml] ✗ Error message:', e instanceof Error ? e.message : String(e))

        const errorMsg = e instanceof Error ? e.message : String(e)

        // Check if it's an auth required error
        if (errorMsg.includes('AUTH_REQUIRED:')) {
            // Extract domain from error message (format: "AUTH_REQUIRED:https://example.com")
            const domain = errorMsg.split('AUTH_REQUIRED:')[1]?.trim() || new URL(url).origin
            console.log('[fetchRawHtml] ✗ Auth required for domain:', domain)
            throw new AuthRequiredError(domain)
        }

        // If it's any other error (invoke IS available but request failed), rethrow
        console.log('[fetchRawHtml] ✗ Re-throwing error (no fallback to direct fetch)')
        throw e
    }
}

export default fetchRawHtml
