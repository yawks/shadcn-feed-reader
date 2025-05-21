export interface Backend {
  getFolders: () => Promise<FeedFolder[]>
  getFeedItems(filter: FeedFilter, offset: number): Promise<FeedItem[]>
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
  id: string
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
  ALL = 'all',
  STARRED = 'starred',
  FOLDER = 'folder',
  FEED = 'feed'
}

export type FeedFilter = {
  id: string
  type: FeedType
  onlyUnreadItems: boolean
}
