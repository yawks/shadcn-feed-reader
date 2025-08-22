import { FeedItem, FeedType } from '@/backends/types'
import { useEffect, useState } from 'react'
import { useLocation, useParams } from '@tanstack/react-router'

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
import { useInfiniteQuery } from '@tanstack/react-query'

export default function Feeds() {
  const params = useParams({ strict: false });
  const location = useLocation();
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
    } else {
      // Cas pour "All articles" (route /)
      setFeedQuery({
        feedFilter: feedQuery.feedFilter,
        feedType: undefined, // Tous les articles, pas de type spécifique
        feedId: undefined,
        folderId: undefined
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.feedId, params.folderId, location.pathname])

  const [selectedFeedArticle, setSelectedFeedArticle] = useState<FeedItem | null>(null);

  // Infinite query pour charger les items par page
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
      // lastPage est le tableau d'items retourné
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].id; // ou autre logique d'offset
    },
  });

  // Fusionner toutes les pages d'items
  const items = data?.pages.flat() ?? [];

  // Gestion des états d'erreur
  if (error) {
    return (
      <>
        <Header>
          <Search />
          <div className='ml-auto flex items-center space-x-4'>
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>
        <Main fixed>
          <div className="flex h-full items-center justify-center">
            <p className="text-red-500">Erreur lors du chargement des articles: {error.message}</p>
          </div>
        </Main>
      </>
    );
  }

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
          {isLoading ? (
            <ItemsListLoader />
          ) : (
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
          )}
          {/* Right Side */}
          {selectedFeedArticle != null ? (<FeedArticle item={selectedFeedArticle} />) : (<WebPageLoader />)}
        </section>
      </Main>
    </>
  )
}
