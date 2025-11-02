/**
 * Feed Directory Dialog Component
 * Displays a categorized directory of RSS feeds that users can subscribe to
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { AlertCircle, Loader2, Plus, Search as SearchIcon } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Feed, FeedCategory, FeedSubcategory } from '@/types/feed-directory'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Suspense, useEffect, useState } from 'react'
import { createFeedListResource, parseFeedsFromXmlString } from '@/utils/feed-resource'
import { getCategoryColor, getCategoryIcon } from '@/utils/feed-directory-icons'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import FeedBackend from '@/backends/nextcloud-news/nextcloud-news'
import type { FeedFolder } from '@/backends/types'
import { Input } from '@/components/ui/input'
import { safeInvoke } from '@/lib/safe-invoke'
import { toast } from 'sonner'
import { useFeedDirectory } from '@/hooks/use-feed-directory'
import { useQueryClient } from '@tanstack/react-query'

// Local type used for optimistically updating the sidebar folders cache
type NavItemCache = {
  url?: string
  items?: Array<{ title?: string; url?: string; iconUrl?: string; badge?: string }>
}

interface FeedDirectoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Card component for displaying a subcategory
 */
interface SubcategoryCardProps {
  subcategory: FeedSubcategory
  categoryIndex: number
  count?: number | undefined
}

function SubcategoryCard({ subcategory, categoryIndex, count }: SubcategoryCardProps) {
  const Icon = getCategoryIcon(subcategory.name)
  const colorClass = getCategoryColor(categoryIndex)
  const [open, setOpen] = useState(false)
  const [resource, setResource] = useState<any | null>(null)

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

        {/* Expanded feed list rendered inside the card */}
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

/**
 * Loading skeleton for the directory
 */
function DirectoryLoading() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-10 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-32 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Error display component
 */
interface ErrorDisplayProps {
  error: Error
  onRetry: () => void
}

function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <div className="text-center space-y-2">
        <h3 className="font-semibold">Failed to load feed directory</h3>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
      <Button onClick={onRetry} variant="outline">
        Try Again
      </Button>
    </div>
  )
}

/**
 * Main directory content component
 */
function DirectoryContent() {
  const { data, isLoading, error, refetch } = useFeedDirectory()
  const [searchQuery, setSearchQuery] = useState('')
  const [counts, setCounts] = useState<Record<string, number | undefined>>({})
  const [selectedSource, setSelectedSource] = useState<string>('atlas')
  const [urlInput, setUrlInput] = useState<string>('')
  const [urlFolders, setUrlFolders] = useState<FeedFolder[] | null>(null)
  const [urlPopoverOpen, setUrlPopoverOpen] = useState(false)
  const queryClient = useQueryClient()
  

  // Prefetch counts for subcategories using the Tauri proxy in batches to avoid
  // firing too many requests at once. We store counts in a map keyed by xmlUrl
  // when available, otherwise by subcategory name.
  useEffect(() => {
    if (!data) return
    let mounted = true

    const subs = data.categories.flatMap((c) => c.subcategories)
        const tasks = subs.map((sub) => {
      return async () => {
        if (!sub.xmlUrl) return
        const key = sub.xmlUrl ?? sub.name
        // don't refetch if we already have a value
        if (counts[key] !== undefined) return
        try {
          const raw = await safeInvoke('fetch_raw_html', { url: sub.xmlUrl })
          const feeds = parseFeedsFromXmlString(raw)
          if (!mounted) return
          setCounts((p) => ({ ...p, [key]: feeds.length }))
        } catch {
          if (!mounted) return
          setCounts((p) => ({ ...p, [key]: 0 }))
        }
      }
    })

    const concurrency = 6
    ;(async () => {
      for (let i = 0; i < tasks.length; i += concurrency) {
        const chunk = tasks.slice(i, i + concurrency).map((fn) => fn())
  await Promise.all(chunk)
      }
    })()

    return () => {
      mounted = false
    }
    // We intentionally omit `counts` to avoid restarting when we set counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  
  if (isLoading) {
    return <DirectoryLoading />
  }
  
  if (error) {
    return <ErrorDisplay error={error} onRetry={refetch} />
  }
  
  if (!data || data.categories.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No feeds found in the directory.</p>
      </div>
    )
  }
  
  // Filter categories and subcategories based on search query
  const filteredCategories = searchQuery
    ? data.categories
        .map((category) => ({
          ...category,
          subcategories: category.subcategories.filter((sub) =>
            sub.name.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((category) => category.subcategories.length > 0)
    : data.categories
  
  return (
    <div className="space-y-4">
      {/* Top controls: URL input + add button, and source selector */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Enter a RSS / Atom url
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="Enter feed URL (https://...)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1"
            />
            <Popover open={urlPopoverOpen} onOpenChange={(v) => setUrlPopoverOpen(v)}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                  // lazily load folders when opening
                  if (!urlFolders) {
                    try {
                      const backend = new FeedBackend()
                      const f = await backend.getFolders()
                      setUrlFolders(f)
                    } catch (_e) {
                      toast.error('Failed to load folders')
                    }
                  }
                  setUrlPopoverOpen(true)
                }}
                aria-label="Add feed to folder"
              >
                <Plus className="w-4 h-4" />
              </Button>
              </PopoverTrigger>
              <PopoverContent sideOffset={8} align="end">
              <div className="flex flex-col gap-2">
                <button
                  className="text-sm italic text-muted-foreground text-left w-full px-2 py-1 hover:bg-muted rounded"
                  onClick={async () => {
                    if (!urlInput) return toast.error('Enter a feed URL first')
                    try {
                      const backend = new FeedBackend()
                      const created = await backend.addFeed(urlInput, null)
                      toast.message('Subscribed')
                      setUrlPopoverOpen(false)
                      setUrlInput('')
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
                    } catch (_e) {
                      toast.error('Failed to subscribe')
                    }
                  }}
                >
                  No folder
                </button>
                {urlFolders ? (
                  urlFolders.map((folder) => (
                    <button
                      key={folder.id}
                      className="text-sm text-left w-full px-2 py-1 hover:bg-muted rounded"
                      onClick={async () => {
                        if (!urlInput) return toast.error('Enter a feed URL first')
                        try {
                          const backend = new FeedBackend()
                          const created = await backend.addFeed(urlInput, Number(folder.id))
                          toast.message(`Subscribed to ${folder.name}`)
                          setUrlPopoverOpen(false)
                          setUrlInput('')
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

        {/* Separator with OR label */}
        <div className="relative flex items-center py-4">
          <div className="flex-grow border-t border-border"></div>
          <span className="flex-shrink mx-4 text-sm font-medium text-muted-foreground">OR</span>
          <div className="flex-grow border-t border-border"></div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Select a feed from source :
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="flex items-center gap-2">
                <span className="text-lg">🇫🇷</span>
                <span className="text-sm">Atlas des flux</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent sideOffset={8} align="start">
              <div className="flex flex-col gap-2">
                <button
                  className="text-sm text-left w-full px-2 py-1 hover:bg-muted rounded flex items-center gap-2"
                  onClick={() => setSelectedSource('atlas')}
                >
                  <span className="text-lg">🇫🇷</span>
                  Atlas des flux
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {selectedSource === 'atlas' ? (
        <>
          {/* Search Input */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search feeds..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Categories Accordion */}
          {filteredCategories.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No feeds match your search.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {filteredCategories.map((category: FeedCategory, index: number) => {
                const Icon = getCategoryIcon(category.name)
                const colorClass = getCategoryColor(index)
                
                return (
                  <AccordionItem key={category.name} value={category.name} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Icon className={`h-5 w-5 ${colorClass}`} />
                        <span className="font-medium">{category.name}</span>
                        <Badge variant="outline" className="ml-2">
                          {category.subcategories.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 pt-4">
                        {category.subcategories.map((subcategory: FeedSubcategory) => {
                          const key = subcategory.xmlUrl ?? subcategory.name
                          return (
                            <SubcategoryCard
                              key={key}
                              subcategory={subcategory}
                              categoryIndex={index}
                              count={counts[key]}
                            />
                          )
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Select a source to browse feeds.</p>
        </div>
      )}
    </div>
  )
}

/**
 * Feed list reader component used inside Suspense.
 */
function FeedList({ resource }: { resource: { read: () => Feed[] } }) {
  const feeds = resource.read()

  const [folders, setFolders] = useState<FeedFolder[] | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const backend = new FeedBackend()
  const queryClient = useQueryClient()

  if (!feeds || feeds.length === 0) {
    return <div className="text-sm text-muted-foreground">No feeds found in this subcategory.</div>
  }
  const getFavicon = (f: Feed) => {
    const defaultFav = 'https://www.google.com/s2/favicons?sz=64&domain=example.com'
    try {
      const u = new URL((f.site || f.address)!.startsWith('http') ? (f.site || f.address)! : `https://${(f.site || f.address)}`)
      return `${u.origin}/favicon.ico`
  } catch {
      try {
        const u2 = new URL((f.site || f.address)!.startsWith('http') ? (f.site || f.address)! : `https://${(f.site || f.address)}`)
        return `https://www.google.com/s2/favicons?sz=64&domain=${u2.hostname}`
      } catch {
        return defaultFav
      }
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      // open and load folders lazily
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
                  </Button>
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
                          // If API returned the created feed, try to update cache optimistically
                          if (created) {
                            // Update the ['folders'] nav cache used by the sidebar
                            queryClient.setQueryData<NavItemCache[]>(['folders'], (old: NavItemCache[] | undefined) => {
                                  if (!old) return old
                                  // Attempt to find the folder matching created.folderId
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
                            // Fallback: refetch folders
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

// Small component to synchronously read resource inside a Suspense boundary
function FeedCountFromResource({ resource }: { resource: { read: () => Feed[] } }) {
  const feeds = resource.read()
  return <>{feeds.length}</>
}

/**
 * Main Feed Directory Dialog component
 */
export function FeedDirectoryDialog({ open, onOpenChange }: FeedDirectoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="w-[95vw] md:max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Subscribe to Feeds</DialogTitle>
          <DialogDescription>
            Browse and subscribe to RSS feeds from various categories
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-1">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <DirectoryContent />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  )
}
