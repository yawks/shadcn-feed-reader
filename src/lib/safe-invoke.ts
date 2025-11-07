// A tiny compatibility wrapper around Tauri's `invoke` that falls back to
// fetching the URL directly when running in non-Tauri environments (browser,
// capacitor, etc.). This prevents `invoke` being undefined at runtime.
export async function safeInvoke(cmd: string, args?: Record<string, unknown>) {
  // Try to import Tauri's invoke dynamically so importing this module does
  // not throw in environments where @tauri-apps/api is not installed.
  let tauriInvoke: any
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('@tauri-apps/api/core') as any
    tauriInvoke = mod?.invoke
    if (typeof tauriInvoke !== 'function') {
      console.warn('[safeInvoke] ✗ Tauri module loaded but invoke is not a function')
      throw new Error(`Tauri invoke not available for command: ${cmd}`)
    }
  } catch (e) {
    console.warn('[safeInvoke] ✗ Failed to import @tauri-apps/api/core:', e)
    throw new Error(`Tauri invoke not available for command: ${cmd}`)
  }

  // Tauri is available, now call it (errors from here should propagate)
  console.log('[safeInvoke] ✓ Tauri invoke found, calling:', cmd)
  return await tauriInvoke(cmd, args)
}

export default safeInvoke
