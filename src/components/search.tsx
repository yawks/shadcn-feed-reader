import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn, timeSince } from '@/lib/utils'

import FeedBackend from '@/backends/nextcloud-news/nextcloud-news'
import { FeedFavicon } from '@/components/ui/feed-favicon'
import { FeedItem } from '@/backends/types'
import { IconSearch, IconX } from '@tabler/icons-react'
import React from 'react'
import { useSearch } from '@/context/search-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'

interface Props {
  readonly className?: string
  readonly placeholder?: string
}

export function Search({ className = '', placeholder = 'Search articles...' }: Props) {
  const {
    open,
    setOpen,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    isSearching,
    setIsSearching,
    searchError,
    setSearchError,
    setIsSearchMode,
  } = useSearch()
  const backend = React.useMemo(() => new FeedBackend(), [])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [isExpanded, setIsExpanded] = React.useState(false)

  const handleMobileSearchToggle = React.useCallback(() => {
    if (!isExpanded) {
      setIsExpanded(true)
      setOpen(true)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isExpanded, setOpen])

  const handleMobileClose = React.useCallback(() => {
    setIsExpanded(false)
    setOpen(false)
    setSearchQuery('')
  }, [setOpen, setSearchQuery])

  // Global keyboard shortcut for Cmd+K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (isMobile) {
          handleMobileSearchToggle()
        } else {
          setOpen(true)
          // Focus the input when opening with keyboard
          setTimeout(() => {
            inputRef.current?.focus()
          }, 0)
        }
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [setOpen, isMobile, handleMobileSearchToggle])

  // Close popup when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        // On mobile, also collapse the search field
        if (isMobile) {
          setIsExpanded(false)
        }
      }
    }

    if (open || (isMobile && isExpanded)) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, setOpen, isMobile, isExpanded])

  // Debounced search effect for autocomplete
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsSearching(true)
        setSearchError(null)
        const results = await backend.searchItems(searchQuery)
        setSearchResults(results.slice(0, 5)) // Limit to 5 results for autocomplete
      } catch (error) {
        setSearchResults([])
        setSearchError(error instanceof Error ? error.message : 'Search failed')
      } finally {
        setIsSearching(false)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchQuery, backend, setSearchResults, setIsSearching, setSearchError])

  // Handle Enter key to show full search results
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setOpen(false)
    // On mobile, also collapse the search field
    if (isMobile) {
      setIsExpanded(false)
    }
    
    try {
      setIsSearching(true)
      setSearchError(null)
      const results = await backend.searchItems(searchQuery)
      setSearchResults(results)
      setIsSearchMode(true) // Enable search mode to show results in main list
    } catch (error) {
      setSearchResults([])
      setSearchError(error instanceof Error ? error.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  const handleItemSelect = (item: FeedItem) => {
    setOpen(false)
    // On mobile, also collapse the search field
    if (isMobile) {
      setIsExpanded(false)
    }
    // Open the article in a new tab
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Mobile: Show button when collapsed, input when expanded */}
      {isMobile ? (
        <>
          {!isExpanded ? (
            // Mobile search button
            <Button
              variant="outline"
              size="sm"
              onClick={handleMobileSearchToggle}
              className="flex items-center gap-2 h-8 px-3 bg-muted/25 hover:bg-muted/50"
            >
              <IconSearch className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Search...</span>
            </Button>
          ) : (
            // Mobile expanded search input
            <div className="fixed inset-x-0 top-0 z-50 bg-background border-b border-border p-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <IconSearch
                    aria-hidden='true'
                    className='absolute top-1/2 left-3 -translate-y-1/2 h-4 w-4 text-muted-foreground'
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSearch()
                      }
                      if (e.key === 'Escape') {
                        handleMobileClose()
                      }
                    }}
                    placeholder={placeholder}
                    className="h-10 w-full rounded-md border border-input bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMobileClose}
                  className="h-10 w-10 p-0"
                >
                  <IconX className="h-4 w-4" />
                  <span className="sr-only">Close search</span>
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        // Desktop: Regular search input
        <div className="relative">
          <IconSearch
            aria-hidden='true'
            className='absolute top-1/2 left-1.5 -translate-y-1/2 h-4 w-4 text-muted-foreground'
          />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSearch()
              }
              if (e.key === 'Escape') {
                setOpen(false)
                inputRef.current?.blur()
              }
            }}
            placeholder={placeholder}
            className={cn(
              'bg-muted/25 text-foreground placeholder:text-muted-foreground hover:bg-muted/50 h-8 w-full flex-1 rounded-md text-sm border border-input pl-7 pr-12 md:w-40 lg:w-56 xl:w-72 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              className
            )}
          />
          <kbd className='bg-muted pointer-events-none absolute top-[0.3rem] right-[0.3rem] hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none sm:flex'>
            <span className='text-xs'>⌘</span>K
          </kbd>
        </div>
      )}

      {/* Autocomplete popup */}
      {open && (searchQuery.trim() || isSearching) && (
        <div className={cn(
          "absolute z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden",
          isMobile && isExpanded 
            ? "fixed inset-x-4 top-20 max-h-[calc(100vh-6rem)]" 
            : "top-full left-0 right-0 mt-1 max-h-[300px]"
        )}>
          <Command shouldFilter={false}>
            <CommandList className={isMobile ? "max-h-[calc(100vh-8rem)]" : "max-h-[300px]"}>
              {!searchQuery.trim() && !isSearching && (
                <CommandEmpty>Start typing to search articles...</CommandEmpty>
              )}
              
              {isSearching && (
                <CommandEmpty>Searching...</CommandEmpty>
              )}
              
              {searchError && (
                <CommandEmpty className="text-destructive">
                  Error: {searchError}
                </CommandEmpty>
              )}
              
              {searchQuery.trim() && !isSearching && !searchError && searchResults.length === 0 && (
                <CommandEmpty>No articles found. Press Enter to see all results.</CommandEmpty>
              )}
              
              {searchResults.length > 0 && (
                <CommandGroup heading="Recent Articles">
                  {searchResults.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.title} ${item.feed?.title}`}
                      onSelect={() => handleItemSelect(item)}
                      className="flex items-start gap-3 p-3 cursor-pointer"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-md overflow-hidden bg-muted/50 ring-1 ring-border/10">
                        {item.thumbnailUrl ? (
                          <img 
                            src={item.thumbnailUrl} 
                            alt={item.title} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <div className="w-full h-full bg-muted" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="font-medium leading-tight line-clamp-2 text-foreground">
                          {item.title}
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            {item.feed?.faviconUrl && (
                              <FeedFavicon 
                                src={item.feed.faviconUrl} 
                                alt={item.feed.title}
                                className="w-3 h-3 rounded-sm flex-shrink-0"
                              />
                            )}
                            <span className="font-medium truncate">{item.feed?.title}</span>
                          </div>
                          <span className="text-muted-foreground/60">•</span>
                          <time className="whitespace-nowrap">
                            {timeSince(item.pubDate?.getTime() ?? 0)}
                          </time>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                  {searchQuery.trim() && (
                    <CommandItem
                      value="search-all"
                      onSelect={handleSearch}
                      className="border-t"
                    >
                      <IconSearch className="mr-2 h-4 w-4" />
                      Press Enter to see all results for "{searchQuery}"
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
