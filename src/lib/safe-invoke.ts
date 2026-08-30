// A tiny compatibility wrapper around Tauri's `invoke` that falls back to
// using the HTTP API when running outside Tauri. Tauri desktop and mobile use
// the same commands and shared Rust proxy implementation.

// Helper to check if running in Web/Docker mode (no Tauri)
export function isWebMode(): boolean {
  if (typeof window === 'undefined') return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any
  const hasTauri = !!(win.__TAURI_INTERNALS__ || win.__TAURI__)
  return !hasTauri
}

// Transform Tauri command args to HTTP API format
// Tauri commands use named parameters, but HTTP API expects the payload directly
function transformArgsForHttp(cmd: string, args?: Record<string, unknown>): Record<string, unknown> {
  if (!args) return {}

  // perform_form_login: Tauri expects { request: LoginRequest }, HTTP expects LoginRequest directly
  if (cmd === 'perform_form_login' && args.request) {
    return args.request as Record<string, unknown>
  }

  return args
}

export async function safeInvoke(cmd: string, args?: Record<string, unknown>) {
  // Check if we are in a Tauri desktop or mobile environment.
  // @ts-ignore
  const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

  if (isTauri) {
    let tauriInvoke: any
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import('@tauri-apps/api/core') as any
      tauriInvoke = mod?.invoke
    } catch (e) {
      console.warn('[safeInvoke] ✗ Failed to import @tauri-apps/api/core:', e)
    }

    if (tauriInvoke && typeof tauriInvoke === 'function') {
      try {
        console.log('[safeInvoke] ⚡ Tauri invoke:', cmd, args)
        return await tauriInvoke(cmd, args)
      } catch (callError) {
        // If it fails with specific internal errors, might attempt fallback?
        // But usually if isTauri is true, we should trust it.
        console.error('[safeInvoke] ✗ Tauri invoke failed:', callError)
        throw callError
      }
    }
  }

  // Fallback to HTTP API (Docker/Web mode)
  const httpArgs = transformArgsForHttp(cmd, args)
  console.log('[safeInvoke] 🌐 HTTP API fallback:', cmd, httpArgs)

  try {
    const response = await fetch(`/api/${cmd}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(httpArgs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    // Determine return type based on command or content-type
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      // Logic for specific commands that return numbers/strings
      const text = await response.text();
      
      if (cmd === 'start_proxy') {
        return parseInt(text, 10);
      }
      
      return text;
    }
  } catch (e) {
    console.error('[safeInvoke] ✗ HTTP API failed:', e);
    throw e;
  }
}

export default safeInvoke;
