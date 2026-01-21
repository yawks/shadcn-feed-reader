import { useState, Suspense } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus } from 'lucide-react'
import { createFeedListResource } from '@/utils/feed-resource'
import FeedBackend from '@/backends/nextcloud-news/nextcloud-news'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { FeedSubcategory, Feed } from '@/types/feed-directory'
import type { FeedFolder } from '@/backends/types'
import { getCategoryIcon, getCategoryColor } from '@/utils/feed-directory-icons'

// Local type used for optimistically updating the sidebar folders cache
// (duplicated for now, can be refactored)
type NavItemCache = {
  url?: string
  items?: Array<{ title?: string; url?: string; iconUrl?: string; badge?: string }>
}

interface SubcategoryCardProps {
  subcategory: FeedSubcategory
  categoryIndex: number
  count?: number | undefined
}

export function SubcategoryCard({ subcategory, categoryIndex, count }: SubcategoryCardProps) {
  const Icon = getCategoryIcon(subcategory.name)
  const colorClass = getCategoryColor(categoryIndex)
  const [open, setOpen] = useState(false)
  const [resource, setResource] = useState<{ read: () => Feed[] } | null>(null)

  const handleToggle = () => {
    if (!open && subcategory.xmlUrl && !resource) {
      const r = createFeedListResource(subcategory.xmlUrl)
      setResource(r)
    }
    setOpen((v) => !v)
  }

  return (
    <div>
      <Card className="group relative overflow-hidden transition-all hover:shadow-md">
        <div onClick={handleToggle}>
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between">
              <div className={`rounded-lg bg-muted p-2 ${colorClass}`}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
            <CardTitle className="text-sm font-medium leading-tight">
              {subcategory.name}
            </CardTitle>
            <Badge variant="secondary" className="w-fit text-xs">
              {typeof count === 'number' ? (
                count
              ) : open && resource ? (
                <Suspense fallback="…">
                  <FeedCountFromResource resource={resource} />
                </Suspense>
              ) : typeof subcategory.feeds?.length === 'number' && subcategory.feeds.length > 0 ? (
                subcategory.feeds.length
              ) : (
                '—'
              )} feeds
            </Badge>
          </CardHeader>
        </div>
        {open && (
          <div className="mt-2 px-4 pb-4">
            {!resource ? (
              <div className="text-sm text-muted-foreground">No XML URL available for this subcategory.</div>
            ) : (
              <Suspense fallback={<div className="py-6 text-center"><Loader2 className="animate-spin mx-auto" /></div>}>
                <FeedList resource={resource} />
              </Suspense>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

export function DirectoryLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-muted rounded animate-pulse" />
      <div className="h-8 bg-muted rounded animate-pulse" />
      <div className="h-8 bg-muted rounded animate-pulse" />
    </div>
  )
}

export function FeedList({ resource }: { resource: { read: () => Feed[] } }) {
  const feeds = resource.read()
  const [folders, setFolders] = useState<FeedFolder[] | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const backend = new FeedBackend()
  const queryClient = useQueryClient()

  if (!feeds || feeds.length === 0) {
    return <div className="text-sm text-muted-foreground">No feeds found in this subcategory.</div>
  }
  function getFavicon(f: Feed): string {
    const defaultFav = 'https://www.google.com/s2/favicons?sz=64&domain=example.com'
    const url = getFeedUrl(f)
    if (url) return `${url}/favicon.ico`
    const domain = getFeedDomain(f)
    if (domain) return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`
    return defaultFav
  }
  function getFeedUrl(f: Feed): string | undefined {
    const val = f.site || f.address
    if (!val) return undefined
    try {
      return getUrlOrigin(val)
    } catch {
      return undefined
    }
  }
  function getFeedDomain(f: Feed): string | undefined {
    const val = f.site || f.address
    if (!val) return undefined
    try {
      return getUrlHostname(val)
    } catch {
      return undefined
    }
  }
  function getUrlOrigin(val: string): string | undefined {
    try {
      const u = new URL(val.startsWith('http') ? val : `https://${val}`)
      return u.origin
    } catch {
      return undefined
    }
  }
  function getUrlHostname(val: string): string | undefined {
    try {
      const u = new URL(val.startsWith('http') ? val : `https://${val}`)
      return u.hostname
    } catch {
      return undefined
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {feeds.map((f, idx) => (
        <div key={idx} className="w-full rounded-md">
          <div className="grid grid-cols-[1fr_48px] items-center gap-3 p-2 hover:bg-muted rounded">
            <div className="flex items-center gap-3">
              <img
                src={getFavicon(f)}
                alt="favicon"
                className="w-6 h-6 rounded-sm object-contain"
                onError={(e) => {
                  const t = e.currentTarget as HTMLImageElement
                  t.src = 'https://www.google.com/s2/favicons?sz=64&domain=example.com'
                }}
              />
              <div className="flex flex-col">
                <div className="text-sm font-medium">{f.source}</div>
                <div className="text-xs text-muted-foreground">{f.site || f.address}</div>
              </div>
            </div>
            <div className="flex justify-end">
              <Popover open={openIndex === idx} onOpenChange={(isOpen) => setOpenIndex(isOpen ? idx : null)}>
                <PopoverTrigger asChild>
                  <button
                    className="p-2"
                    onClick={async () => {
                      if (!folders) {
                        try {
                          const f = await backend.getFolders()
                          setFolders(f)
                        } catch {
                          toast.error('Failed to load folders')
                        }
                      }
                      setOpenIndex(idx)
                    }}
                    aria-label={`subscribe ${f.source}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent sideOffset={8} align="end">
                  <div className="flex flex-col gap-2">
                    <button
                      className="text-sm italic text-muted-foreground text-left w-full px-2 py-1 hover:bg-muted rounded"
                      onClick={async () => {
                        try {
                          const created = await backend.addFeed(f.address || f.site || '', null)
                          toast.message('Subscribed')
                          setOpenIndex(null)
                          if (created) {
                            queryClient.setQueryData<NavItemCache[]>(['folders'], (old: NavItemCache[] | undefined) => {
                              if (!old) return old
                              const folderUrl = `/folder/${created.folderId}`
                              return old.map((item) => {
                                if (item.url === folderUrl) {
                                  const existingItems = Array.isArray(item.items) ? item.items : []
                                  return {
                                    ...item,
                                    items: [
                                      ...existingItems,
                                      {
                                        title: created.title,
                                        url: `/feed/${created.id}`,
                                        iconUrl: created.faviconUrl,
                                        badge: created.unreadCount > 0 ? String(created.unreadCount) : undefined,
                                      },
                                    ],
                                  }
                                }
                                return item
                              })
                            })
                          } else {
                            await queryClient.invalidateQueries({ queryKey: ['folders'] })
                          }
                        } catch {
                          toast.error('Failed to subscribe')
                        }
                      }}
                    >
                      No folder
                    </button>
                    {folders ? (
                      folders.map((folder) => (
                        <button
                          key={folder.id}
                          className="text-sm text-left w-full px-2 py-1 hover:bg-muted rounded"
                          onClick={async () => {
                            try {
                              const created = await backend.addFeed(f.address || f.site || '', Number(folder.id))
                              toast.message(`Subscribed to ${folder.name}`)
                              setOpenIndex(null)
                              if (created) {
                                queryClient.setQueryData<NavItemCache[]>(['folders'], (old: NavItemCache[] | undefined) => {
                                  if (!old) return old
                                  const folderUrl = `/folder/${created.folderId}`
                                  return old.map((item) => {
                                    if (item.url === folderUrl) {
                                      const existingItems = Array.isArray(item.items) ? item.items : []
                                      return {
                                        ...item,
                                        items: [
                                          ...existingItems,
                                          {
                                            title: created.title,
                                            url: `/feed/${created.id}`,
                                            iconUrl: created.faviconUrl,
                                            badge: created.unreadCount > 0 ? String(created.unreadCount) : undefined,
                                          },
                                        ],
                                      }
                                    }
                                    return item
                                  })
                                })
                              } else {
                                await queryClient.invalidateQueries({ queryKey: ['folders'] })
                              }
                            } catch {
                              toast.error('Failed to subscribe')
                            }
                          }}
                        >
                          {folder.name}
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">Loading folders…</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function FeedCountFromResource({ resource }: { resource: { read: () => Feed[] } }) {
  const feeds = resource.read()
  return <>{feeds.length}</>
}

