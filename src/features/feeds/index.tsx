import { FeedItem, FeedType } from '@/backends/types'
import { FilterItemList, FilterItemListRef } from './FilterItemList'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { FeedArticle } from './FeedArticle'
import { FontSizeSwitch } from '@/components/font-size-switch'
import { Header } from '@/components/layout/header'
import { IconX } from '@tabler/icons-react'
import { ItemsListLoader } from '@/components/layout/loaders/itemslist-loader'
import { Main } from '@/components/layout/main'
import { MobileBackButton } from '@/components/mobile-back-button'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ResizeHandle } from '@/components/ui/resize-handle'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { WebPageLoader } from '@/components/layout/loaders/webpage-loader'
import { useFeedQuery } from '@/context/feed-query-provider'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useIsMobile } from '@/hooks/use-mobile'
import { useResizablePanelsFlex } from '@/hooks/use-resizable-panels-flex'
import { useSearch } from '@/context/search-context'

export default function Feeds() {
  const params = useParams({ strict: false });
  const location = useLocation();
  const navigate = useNavigate();
  const { feedQuery, setFeedQuery } = useFeedQuery()
  const { isSearchMode, searchResults, clearSearchMode } = useSearch()
  const isMobile = useIsMobile()

  // Ref for the list container to manage scroll
  const filterItemListRef = useRef<FilterItemListRef>(null)

  // State to store scroll position
  const [scrollPosition, setScrollPosition] = useState(0)

  // Get articleId from URL search params
  const articleId = new URLSearchParams(location.search).get('articleId')

  // Check if we are displaying an article via the URL (articleId parameter)
  // On mobile, show the article if articleId is present in the URL
  const showArticleOnMobile = isMobile && Boolean(articleId)

  // Hook to manage resizable panels (desktop only)
  const {
    leftFlex,
    rightFlex,
    isResizing,
    handleMouseDown
  } = useResizablePanelsFlex({
    leftPanelKey: 'feeds-65-flex',
    rightPanelKey: 'feeds-article-flex',
    defaultLeftFlex: 0.4,
    defaultRightFlex: 0.6,
    minLeftFlex: 0.15,
    minRightFlex: 0.15
  })

  useEffect(() => {
    if (params.feedId) {
      setFeedQuery({
        feedFilter: feedQuery.feedFilter,
        feedType: FeedType.FEED,
        feedId: params.feedId,
        folderId: undefined
      })
    } else if (params.folderId) {
      setFeedQuery({
        feedFilter: feedQuery.feedFilter,
        feedType: FeedType.FOLDER,
        feedId: undefined,
        folderId: params.folderId
      })
    } else {
      // Case for "All articles" (route /)
      setFeedQuery({
        feedFilter: feedQuery.feedFilter,
        feedType: undefined, // All articles, no specific type
        feedId: undefined,
        folderId: undefined
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.feedId, params.folderId, location.pathname])

  const [selectedFeedArticle, setSelectedFeedArticle] = useState<FeedItem | null>(null);

  // Function to handle article selection (desktop and mobile)
  const handleArticleSelection = (article: FeedItem | null) => {
    setSelectedFeedArticle(article)

    if (isMobile && article) {
      // Save the scroll position before navigating
      const currentScroll = filterItemListRef.current?.getScrollTop() || 0
      setScrollPosition(currentScroll)

      // Navigate to article with articleId in search params
      const searchParams = new URLSearchParams(location.search)
      searchParams.set('articleId', article.id.toString())

      navigate({
        to: location.pathname,
        search: Object.fromEntries(searchParams.entries())
      })
    }
  }

  // Function to go back to the list on mobile
  const handleBackToList = () => {
    // Remove the articleId from the URL to go back to the list
    const searchParams = new URLSearchParams(location.search)
    searchParams.delete('articleId')

    navigate({
      to: location.pathname,
      search: Object.fromEntries(searchParams.entries())
    })
  }

  // Infinite query to load items by page
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['feedItems', feedQuery],
    queryFn: async ({ pageParam = 0 }) => {
      const backend = new (await import('@/backends/nextcloud-news/nextcloud-news')).default();
      return backend.getFeedItems(feedQuery, pageParam);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: FeedItem[], _allPages: FeedItem[][]) => {
      // lastPage is the array of returned items
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].id; // or other offset logic
    },
  });

  // Merge all item pages or use search results if in search mode
  const items = isSearchMode ? searchResults : (data?.pages.flat() ?? []);

  // Effect to restore scroll position when returning to list (mobile only)
  useEffect(() => {
    if (isMobile && !showArticleOnMobile && scrollPosition > 0) {
      // Wait for the component to mount and the data to load
      const restoreScroll = () => {
        if (filterItemListRef.current && items.length > 0) {
          filterItemListRef.current.setScrollTop(scrollPosition)
          // Reset scroll position after restoring to avoid future interference
          setScrollPosition(0)
        }
      }

      // Try immediately
      restoreScroll()

      // Then try with progressive delays just in case
      const timeouts = [50, 150, 300].map(delay =>
        setTimeout(restoreScroll, delay)
      )

      return () => {
        timeouts.forEach(clearTimeout)
      }
    }
  }, [showArticleOnMobile, isMobile, scrollPosition, items.length])

  // Find the article selected based on the articleId in the URL
  const selectedArticleFromUrl = articleId ?
    items.find(item => item.id.toString() === articleId.toString()) : null

  // Use article from URL on mobile
  const currentSelectedArticle = selectedArticleFromUrl || selectedFeedArticle

  // Error handling
  if (error) {
    return (
      <>
        <Header>
          <Search />
          <div className='ml-auto flex items-center space-x-4'>
            <FontSizeSwitch />
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>
        <Main fixed>
          <div className="flex h-full items-center justify-center">
            <p className="text-red-500">Error loading articles: {error.message}</p>
          </div>
        </Main>
      </>
    );
  }

  // Call fetchNextPage when we want to load more
  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  return (
    <>
      {isMobile ? (
        // Full mobile layout
        <>
          {showArticleOnMobile ? (
            // article view on mobile
            <div className="flex flex-col h-dvh">
              <div className="flex items-center p-3 border-b bg-background">
                <MobileBackButton onBack={handleBackToList} />
                <h1 className="ml-3 text-lg font-medium truncate">
                  {currentSelectedArticle?.title}
                </h1>
              </div>
              <div className="flex-1 overflow-hidden">
                {currentSelectedArticle ? (
                  <FeedArticle item={currentSelectedArticle} isMobile={true} />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <WebPageLoader />
                  </div>
                )}
              </div>
            </div>
          ) : (
            // list view on mobile
            <>
              <Header>
                <Search />
                <div className='ml-auto flex items-center space-x-4'>
                  <FontSizeSwitch />
                  <ThemeSwitch />
                  <ProfileDropdown />
                </div>
              </Header>
              <Main fixed>
                <div className="flex flex-col h-full">
                  <h1 className={`sr-only ${feedQuery.feedType ? 'text-blue' : 'text-red'}`}>Feeds</h1>

                  {/* Search mode banner */}
                  {isSearchMode && (
                    <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Search Results ({searchResults.length} articles)
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearSearchMode}
                        className="h-6 w-6 p-0"
                      >
                        <IconX className="h-4 w-4" />
                        <span className="sr-only">Clear search</span>
                      </Button>
                    </div>
                  )}

                  {(isLoading && !isSearchMode) ? (
                    <ItemsListLoader />
                  ) : (
                    <FilterItemList
                      ref={filterItemListRef}
                      items={items}
                      selectedFeedArticle={currentSelectedArticle}
                      setSelectedFeedArticle={handleArticleSelection}
                      onScrollEnd={loadMore}
                      isFetchingNextPage={isFetchingNextPage}
                    />
                  )}
                </div>
              </Main>
            </>
          )}
        </>
      ) : (
        // Layout desktop with resize
        <>
          <Header>
            <Search />
            <div className='ml-auto flex items-center space-x-4'>
              <FontSizeSwitch />
              <ThemeSwitch />
              <ProfileDropdown />
            </div>
          </Header>

          <Main fixed>
            <section className={`flex h-full resizable-container ${isResizing ? 'select-none' : ''}`}>
              <h1 className={`sr-only ${feedQuery.feedType ? 'text-blue' : 'text-red'}`}>Feeds</h1>

              {/* Left Side - Item List */}
              <div
                id="item-list"
                className="flex flex-col h-full bg-background"
                style={{
                  width: `${leftFlex * 100}%`,
                  minWidth: 0,
                  flexShrink: 0,
                }}
              >
                {/* Search mode banner */}
                {isSearchMode && (
                  <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        Search Results ({searchResults.length} articles)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSearchMode}
                      className="h-6 w-6 p-0"
                    >
                      <IconX className="h-4 w-4" />
                      <span className="sr-only">Clear search</span>
                    </Button>
                  </div>
                )}

                {(isLoading && !isSearchMode) ? (
                  <ItemsListLoader />
                ) : (
                  <FilterItemList
                    items={items}
                    selectedFeedArticle={currentSelectedArticle}
                    setSelectedFeedArticle={setSelectedFeedArticle}
                    onScrollEnd={loadMore}
                    isFetchingNextPage={isFetchingNextPage}
                  />
                )}
              </div>

              {/* Resize Handle - Hidden on mobile */}
              <ResizeHandle
                onMouseDown={handleMouseDown}
                className="shrink-0 hidden md:block"
              />

              {/* Right Side - Article Content */}
              <div
                className="flex flex-col h-full bg-background"
                style={{
                  width: `${rightFlex * 100}%`,
                  minWidth: 0,
                  flexShrink: 0
                }}
              >
                {currentSelectedArticle != null ? (
                  <FeedArticle item={currentSelectedArticle} isMobile={false} />
                ) : (
                  <WebPageLoader />
                )}
              </div>
            </section>
          </Main>
        </>
      )}
    </>
  )
}
