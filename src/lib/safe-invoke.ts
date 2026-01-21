// A tiny compatibility wrapper around Tauri's `invoke` that falls back to
// fetching the URL directly when running in non-Tauri environments (browser,
// capacitor, etc.). This prevents `invoke` being undefined at runtime.
export async function safeInvoke(cmd: string, args?: Record<string, unknown>) {
  // Check if we are in a Tauri environment
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

  // Fallback to HTTP API
  console.log('[safeInvoke] 🌐 HTTP API fallback:', cmd, args)
  
  try {
    const response = await fetch(`/api/${cmd}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args || {}),
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
