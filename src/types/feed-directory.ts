/**
 * Type definitions for the feed directory
 */

export interface Feed {
  source: string
  address: string
  site?: string
  category: string
  subCategory: string
  frequency?: string
  entryDate?: string
  verifiedDate?: string
  codeId?: string
  availability?: string
  alert?: string
  group?: string
}

export interface FeedSubcategory {
  name: string
  feeds: Feed[]
  category: string
  xmlUrl?: string
}

export interface FeedCategory {
  name: string
  subcategories: FeedSubcategory[]
  totalFeeds: number
}

export interface FeedDirectoryData {
  categories: FeedCategory[]
  totalFeeds: number
  lastUpdate?: string
}
