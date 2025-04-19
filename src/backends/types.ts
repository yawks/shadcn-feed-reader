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
  feedId: string
  folderId: string
  title: string
  url: string
  pubDate: Date
  read: boolean
  starred: boolean
  body: string
  thumbnailUrl: string
}

export enum FeedType {
  ALL = 'all',
  STARRED = 'starred',
}

export type FeedFilter = {
  folderId: string
  type: FeedType
  withUnreadItems: boolean
}
