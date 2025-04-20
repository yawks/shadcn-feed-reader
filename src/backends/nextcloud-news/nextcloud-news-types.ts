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
  author: string
  pubDate: number
  updatedDate: number
  body: string
  enclosureMime: string
  enclosureLink: string
  mediaThumbnail: string
  mediaDescription: string
  feedId: number
  unread: boolean
  starred: boolean
  lastModified: number
  rtl: boolean
  fingerprint: string
  contentHash: string
}

export type NNFolders = {
  folders : NNFolder[]
}

export type NNFeeds = {
  feeds : NNFeed[]
}