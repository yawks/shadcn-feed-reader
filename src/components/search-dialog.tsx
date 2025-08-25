import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

import FeedBackend from '@/backends/nextcloud-news/nextcloud-news'
import { FeedFavicon } from '@/components/ui/feed-favicon'
import { FeedItem } from '@/backends/types'
import React from 'react'
import { timeSince } from '@/lib/utils'
import { useSearch } from '@/context/search-context'

export function SearchDialog() {
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

  // Debounced search effect
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
        setSearchResults(results)
      } catch (error) {
        setSearchResults([])
        setSearchError(error instanceof Error ? error.message : 'Search failed')
      } finally {
        setIsSearching(false)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchQuery, backend, setSearchResults, setIsSearching, setSearchError])

  // Reset search when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setSearchResults([])
      setIsSearching(false)
      setSearchError(null)
    }
  }, [open, setSearchQuery, setSearchResults, setIsSearching, setSearchError])

  const handleItemSelect = (item: FeedItem) => {
    // Close the search dialog
    setOpen(false)
    
    // Enable search mode to show search results in the main feed view
    setIsSearchMode(true)
    
    // For now, just open the article in a new tab
    // The search results are already available in the context
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search Articles"
      description="Search through your feed articles"
    >
      <CommandInput
        placeholder="Search articles..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
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
          <CommandEmpty>No articles found.</CommandEmpty>
        )}
        
        {searchResults.length > 0 && (
          <CommandGroup heading="Articles">
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
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
