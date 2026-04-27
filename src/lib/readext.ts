/**
 * readext — communication avec l'extension navigateur "readext"
 *
 * L'extension injecte un content script qui dispatche `readext-ready`
 * avec son ID. La PWA peut ensuite appeler directement son service worker
 * via chrome.runtime.sendMessage pour fetcher des articles sans CORS.
 */

/* eslint-disable no-console */

type FetchArticleResult =
  | string
  | { html: string }
  | { content: string; title?: string; byline?: string }
  | { fullHtml: string; title?: string }

class ReadextService {
  private extId: string | null = null
  private initialized = false
  private readyCallbacks: Array<() => void> = []

  /**
   * Initialise l'écoute de l'extension.
   * À appeler une fois au démarrage de l'app (safe à appeler plusieurs fois).
   */
  init(): void {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chrome = (window as any).chrome
    console.log('[readext] init — chrome disponible:', !!chrome, '| chrome.runtime:', !!chrome?.runtime, '| sendMessage:', !!chrome?.runtime?.sendMessage)

    window.addEventListener('readext-ready', (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>
      console.log('[readext] ✅ readext-ready reçu, detail:', customEvent.detail)
      this.extId = customEvent.detail?.id ?? null
      if (!this.extId) {
        console.warn('[readext] ⚠️ readext-ready reçu mais detail.id est absent !')
      } else {
        console.log('[readext] Extension connectée, id:', this.extId)
      }
      this.readyCallbacks.forEach((cb) => cb())
      this.readyCallbacks = []
    })

    console.log('[readext] Dispatch readext-ping...')
    window.dispatchEvent(new Event('readext-ping'))
    console.log('[readext] readext-ping envoyé. En attente de readext-ready...')
  }

  isAvailable(): boolean {
    return this.extId !== null
  }

  getExtId(): string | null {
    return this.extId
  }

  /**
   * Attend que l'extension soit connectée, avec un timeout.
   * Résout immédiatement si déjà disponible.
   */
  waitForReady(timeoutMs = 1000): Promise<boolean> {
    if (this.extId !== null) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.readyCallbacks = this.readyCallbacks.filter((cb) => cb !== onReady)
        resolve(false)
      }, timeoutMs)
      const onReady = () => {
        clearTimeout(timer)
        resolve(true)
      }
      this.readyCallbacks.push(onReady)
    })
  }

  async fetchArticle(url: string): Promise<string> {
    if (!this.extId) {
      throw new Error('[readext] Extension non disponible')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chrome = (window as any).chrome
    if (!chrome?.runtime?.sendMessage) {
      throw new Error('[readext] chrome.runtime.sendMessage non disponible')
    }

    const result: FetchArticleResult = await chrome.runtime.sendMessage(
      this.extId,
      { type: 'FETCH_ARTICLE', url }
    )

    console.log('[readext] Réponse brute de l\'extension:', typeof result, result)

    if (typeof result === 'string') return result
    if (result && typeof result === 'object' && 'html' in result) return result.html
    if (result && typeof result === 'object' && 'fullHtml' in result) {
      // Selection mode: complete HTML document with original CSS/scripts and filtered body.
      // Inject a marker so the PWA can detect this mode and use the HTML as-is.
      return result.fullHtml.replace(
        /<head(\s[^>]*)?>/i,
        (match) => `${match}<meta name="readext-mode" content="fullhtml">`
      )
    }
    if (result && typeof result === 'object' && 'content' in result) {
      // Readability mode: extension returns already-extracted content.
      // Wrap with a marker so handleReadabilityView can use it directly without re-running Readability.
      const title = result.title ? `<title>${result.title}</title>` : ''
      return `<!DOCTYPE html><html><head>${title}</head><body><div id="readext-preprocessed">${result.content}</div></body></html>`
    }
    throw new Error(`[readext] Réponse inattendue: ${JSON.stringify(result)}`)
  }
}

export const readext = new ReadextService()

// Auto-init dès l'import si on est côté navigateur
if (typeof window !== 'undefined') {
  readext.init()
}
