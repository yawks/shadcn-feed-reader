import type { Feed } from '@/types/feed-directory'
import { createResource } from './resource'
import { fetchRawHtml } from '@/lib/raw-html'

function parseFeedsFromXml(xmlString: string): Feed[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')
  const fluxElements = doc.querySelectorAll('flux')
  const parsed: Feed[] = []

  fluxElements.forEach((flux) => {
    const feed: Feed = {
      source: flux.querySelector('source')?.textContent || '',
      address: flux.querySelector('adresse')?.textContent || '',
      site: flux.querySelector('site')?.textContent || undefined,
      category: flux.querySelector('categorie')?.textContent || '',
      subCategory: flux.querySelector('sous_categorie')?.textContent || '',
      frequency: flux.querySelector('frequence')?.textContent || undefined,
      entryDate: flux.querySelector('entree')?.textContent || undefined,
      verifiedDate: flux.querySelector('verifi')?.textContent || undefined,
      codeId: flux.querySelector('codeid')?.textContent || undefined,
      availability: flux.querySelector('dispo')?.textContent || undefined,
      alert: flux.querySelector('alerte')?.textContent || undefined,
      group: flux.querySelector('groupe')?.textContent || undefined,
    }
    if (feed.source && feed.address) parsed.push(feed)
  })

  return parsed
}

export function createFeedListResource(xmlUrl: string) {
  return createResource<Feed[]>(async () => {
    const raw = await fetchRawHtml(xmlUrl)
    const feeds = parseFeedsFromXml(raw)
    return feeds
  })
}

export function parseFeedsFromXmlString(xmlString: string) {
  return parseFeedsFromXml(xmlString)
}
