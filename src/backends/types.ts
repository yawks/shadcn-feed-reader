export interface Backend {
  getFolders: () => Promise<FeedFolder[]>
  getFeedItems(query: FeedQuery, offset: number): Promise<FeedItem[]>
}

export type FeedFolder = {
  id: string
  name: string
  unreadCount: number
  feeds: Feed[]
}

export type Feed = {
  id: string
  title: string
  unreadCount: number
  faviconUrl: string
  folderId: string
}

export type FeedItem = {
  id: number
  feed: Feed | null
  folder: FeedFolder | null
  title: string
  url: string
  pubDate: Date | null
  read: boolean
  starred: boolean
  body: string
  thumbnailUrl: string
}

export enum FeedType {
  FOLDER = 'folder',
  FEED = 'feed',
  STARRED = 'starred',
}

export enum FeedFilter {
  ALL = 'all',
  UNREAD = 'unread',
}

export type FeedQuery = {
  feedType?: FeedType
  feedFilter: FeedFilter,
  feedId?: string
  folderId?: string
}
