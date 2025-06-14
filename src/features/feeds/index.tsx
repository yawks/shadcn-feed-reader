import { FeedItem, FeedType } from '@/backends/types'
import { Suspense, useEffect, useState } from 'react'

import { FeedArticle } from './FeedArticle'
import { FilterItemList } from './FilterItemList'
import { Header } from '@/components/layout/header'
import { ItemsListLoader } from '@/components/layout/loaders/itemslist-loader'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { WebPageLoader } from '@/components/layout/loaders/webpage-loader'
import { useFeedQuery } from '@/context/feed-query-provider'
import { useParams } from '@tanstack/react-router'
import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

export default function Feeds() {
  const params = useParams({ strict: false });
  const { feedQuery, setFeedQuery } = useFeedQuery()

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.feedId, params.folderId])

  const [selectedFeedArticle, setSelectedFeedArticle] = useState<FeedItem | null>(null);

  // Infinite query pour charger les items par page
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSuspenseInfiniteQuery({
    queryKey: ['feedItems', feedQuery],
    queryFn: async ({ pageParam = 0 }) => {
      const backend = new (await import('@/backends/nextcloud-news/nextcloud-news')).default();
      return backend.getFeedItems(feedQuery, pageParam);
    },
    getNextPageParam: (lastPage, allPages) => {
      // lastPage est le tableau d'items retourné
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].id; // ou autre logique d'offset
    },
  });

  // Fusionner toutes les pages d'items
  const items = data.pages.flat();

  // Appeler fetchNextPage quand on veut charger plus
  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <Search />
        <div className='ml-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main fixed>
        <section className='flex h-full'>
          <h1 className={`sr-only ${feedQuery.feedType ? 'text-blue' : 'text-red'}`}>Feeds</h1>
          {/* Left Side */}
          <Suspense fallback={<ItemsListLoader />}>
            <div className="flex flex-col h-full">
              <FilterItemList
                items={items}
                selectedFeedArticle={selectedFeedArticle}
                setSelectedFeedArticle={setSelectedFeedArticle}
                onScrollEnd={loadMore}
              />
              {isFetchingNextPage && (
                <div className="w-full flex justify-center py-2">
                  <ItemsListLoader />
                </div>
              )}
            </div>
          </Suspense>
          {/* Right Side */}
          {selectedFeedArticle != null ? (<FeedArticle item={selectedFeedArticle} />) : (<WebPageLoader />)}
        </section>
      </Main>
    </>
  )
}
