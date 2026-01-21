/**
 * Hook to fetch and parse the feed directory from the XML source
 */

import type { Feed, FeedCategory, FeedDirectoryData, FeedSubcategory } from '@/types/feed-directory'
import { useEffect, useState } from 'react'

import { fetchRawHtml } from '@/lib/raw-html'

const FEED_DIRECTORY_URL = 'https://atlasflux.saynete.net/base_xml'

interface UseFeedDirectoryResult {
  data: FeedDirectoryData | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Parse HTML string to extract feed categories and subcategories
 * The HTML structure contains spans with class "eleme_fichi" for categories
 */
function parseXmlToFeedDirectory(htmlContent: string): FeedDirectoryData {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  
  const categories: Map<string, FeedCategory> = new Map()
  let totalFeeds = 0
  let currentCategory: FeedCategory | null = null
  
  // Find all category entries (elements with class "eleme_fichi")
  const categoryElements = doc.querySelectorAll('.eleme_fichi')
  
  categoryElements.forEach((element) => {
    const categoryText = element.textContent?.trim() || ''
    
    // Skip if empty
    if (!categoryText) return
    
    // Check if it's a subcategory (starts with ∟ or &angrt; entity)
    const isSubcategory = categoryText.includes('∟') || element.innerHTML.includes('&angrt;')
    
    if (isSubcategory) {
      // This is a subcategory
      const subcategoryName = categoryText.replace(/[∟▸›]+/g, '').trim()
      
      if (currentCategory && subcategoryName) {
        // Get the XML link to extract the actual XML URL for later loading
        const linksContainer = element.nextElementSibling
        const xmlLink = linksContainer?.querySelector('a[href$=".xml"]')
        const xmlUrl = xmlLink?.getAttribute('href')
        
        const subcategory: FeedSubcategory = {
          name: subcategoryName,
          feeds: [],
          category: currentCategory.name,
          xmlUrl: xmlUrl || undefined,
        }
        
        currentCategory.subcategories.push(subcategory)
        // Estimate feeds count (will be loaded on demand)
        currentCategory.totalFeeds += 15 // Default estimate
        totalFeeds += 15
      }
    } else {
      // This is a main category
      const categoryName = categoryText
      
      if (categoryName && !categories.has(categoryName)) {
        const newCategory: FeedCategory = {
          name: categoryName,
          subcategories: [],
          totalFeeds: 0,
        }
        categories.set(categoryName, newCategory)
        currentCategory = newCategory
      }
    }
  })
  
  return {
    categories: Array.from(categories.values()).filter(cat => cat.subcategories.length > 0),
    totalFeeds,
    lastUpdate: new Date().toISOString(),
  }
}

/**
 * Hook to load feed directory data
 */
export function useFeedDirectory(): UseFeedDirectoryResult {
  const [data, setData] = useState<FeedDirectoryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  const fetchDirectory = async () => {
    try {
      console.log('[useFeedDirectory] ===== START FETCH =====')
      console.log('[useFeedDirectory] URL:', FEED_DIRECTORY_URL)
      setIsLoading(true)
      setError(null)
      
      // Use fetchRawHtml which prioritizes Capacitor plugin (Android/iOS),
      // then Tauri, then falls back to regular fetch.
      console.log('[useFeedDirectory] Calling fetchRawHtml...')
      const response = await fetchRawHtml(FEED_DIRECTORY_URL)
      console.log('[useFeedDirectory] ✓ fetchRawHtml SUCCESS, response length:', response?.length || 0)
      
      console.log('[useFeedDirectory] Parsing HTML...')
      const parsedData = parseXmlToFeedDirectory(response)
      console.log('[useFeedDirectory] ✓ Parsed', parsedData.categories.length, 'categories')
      setData(parsedData)
      console.log('[useFeedDirectory] ✓ Data set successfully')
    } catch (err) {
      console.error('[useFeedDirectory] ✗ ERROR:', err)
      console.error('[useFeedDirectory] ✗ Error type:', typeof err)
      console.error('[useFeedDirectory] ✗ Error message:', err instanceof Error ? err.message : String(err))
      console.error('[useFeedDirectory] ✗ Error stack:', err instanceof Error ? err.stack : 'N/A')
      setError(err instanceof Error ? err : new Error('Failed to fetch feed directory'))
    } finally {
      setIsLoading(false)
      console.log('[useFeedDirectory] ===== END FETCH =====')
    }
  }
  
  useEffect(() => {
    fetchDirectory()
  }, [])
  
  return {
    data,
    isLoading,
    error,
    refetch: fetchDirectory,
  }
}

/**
 * Hook to load feeds for a specific XML URL
 */
export function useFeedList(xmlUrl: string | null) {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  useEffect(() => {
    if (!xmlUrl) {
      setFeeds([])
      return
    }
    
    const fetchFeeds = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const response = await fetchRawHtml(xmlUrl)
        
        const parser = new DOMParser()
        const doc = parser.parseFromString(response, 'text/xml')
        
        const fluxElements = doc.querySelectorAll('flux')
        const parsedFeeds: Feed[] = []
        
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
          
          if (feed.source && feed.address) {
            parsedFeeds.push(feed)
          }
        })
        
        setFeeds(parsedFeeds)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch feed list'))
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchFeeds()
  }, [xmlUrl])
  
  return { feeds, isLoading, error }
}
