/**
 * Hook to fetch and parse the feed directory from the XML source
 */

import type { Feed, FeedCategory, FeedDirectoryData, FeedSubcategory } from '@/types/feed-directory'
import { useEffect, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'

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
      setIsLoading(true)
      setError(null)
      
      // Use Tauri's fetch_raw_html command
      const response = await invoke<string>('fetch_raw_html', {
        url: FEED_DIRECTORY_URL,
      })
      
      const parsedData = parseXmlToFeedDirectory(response)
      setData(parsedData)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch feed directory'))
    } finally {
      setIsLoading(false)
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
        
        const response = await invoke<string>('fetch_raw_html', {
          url: xmlUrl,
        })
        
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
