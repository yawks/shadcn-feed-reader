export type NNFeed = {
  id: number
  url: string
  title: string
  faviconLink: string
  added: number
  folderId: number
  unreadCount: number
  ordering: number
  link: string
  pinned: boolean
  updateErrorCount: number
  lastUpdateError: number
  items: NNItem[]
  nextUpdateTime: number
}

export type NNFolder = {
  id: number
  name: string
  opened: boolean
  feeds: NNFeed[]
}

export type NNItem = {
  id: number
  guid: string
  guidHash: string
  url: string
  title: string
  author: string | null
  pubDate: number
  updatedDate: number | null
  body: string | null
  enclosureMime: string | null
  enclosureLink: string | null
  mediaThumbnail: string | null
  mediaDescription: string | null
  feedId: number
  unread: boolean
  starred: boolean
  lastModified: number | null
  rtl: boolean
  fingerprint: string
  contentHash: string
}

export type NNFolders = {
  folders: NNFolder[]
}

export type NNFeeds = {
  feeds: NNFeed[]
}

export type NNItems = {
  items: NNItem[]
}

export type NNSearchResult = {
  items: NNItem[]
}
