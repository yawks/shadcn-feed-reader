// A tiny compatibility wrapper around Tauri's `invoke` that falls back to
// fetching the URL directly when running in non-Tauri environments (browser,
// capacitor, etc.). This prevents `invoke` being undefined at runtime.
export async function safeInvoke(cmd: string, args?: Record<string, unknown>) {
  // Try to import Tauri's invoke dynamically so importing this module does
  // not throw in environments where @tauri-apps/api is not installed.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('@tauri-apps/api/core') as any
    const tauriInvoke = mod?.invoke
    if (typeof tauriInvoke === 'function') {
      return await tauriInvoke(cmd, args)
    }
  } catch (_e) {
    // ignore - fallbacks below will handle specific commands
  }

  // Fallbacks for commands we call from the web UI.
  if (cmd === 'fetch_raw_html' && args && typeof args.url === 'string') {
    const url = String(args.url)
    const res = await fetch(url, { method: 'GET', mode: 'cors' })
    if (!res.ok) throw new Error(`Network fetch failed: ${res.status}`)
    return await res.text()
  }

  throw new Error(`Tauri invoke not available for command: ${cmd}`)
}

export default safeInvoke
