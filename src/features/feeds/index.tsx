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
            <FilterItemList feedQuery={feedQuery} selectedFeedArticle={selectedFeedArticle} setSelectedFeedArticle={setSelectedFeedArticle} />
          </Suspense>
          {/* Right Side */}
          {selectedFeedArticle != null ? (<FeedArticle item={selectedFeedArticle} />) : (<WebPageLoader />)}
        </section>
      </Main>
    </>
  )
}
