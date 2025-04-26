import { Suspense, useState } from 'react'

import { FeedArticle } from './FeedArticle'
import { FeedType } from '@/backends/types'
import { FilterItemList } from './FilterItemList'
import { Header } from '@/components/layout/header'
import { ItemsListLoader } from '@/components/layout/loaders/itemslist-loader'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { useParams } from '@tanstack/react-router'

export default function Feeds({ showOnlyUnread, showOnlyStarred }: { readonly showOnlyUnread: boolean, readonly showOnlyStarred: boolean }) {
  const params = useParams({ strict: false });

  let queryType = FeedType.ALL
  if (params.feedId) {
    queryType = FeedType.FEED
  } else if (params.folderId) {
    queryType = FeedType.FOLDER
  } else if (showOnlyStarred) {
    queryType = FeedType.STARRED
  }


  const [feedArticleURL, setFeedArticleURL] = useState<string | null>(null);

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
        <section className='flex h-full gap-6'>
          <h1 className={`sr-only ${showOnlyStarred ? 'text-blue' : 'text-red'}`}>Feeds</h1>
          {/* Left Side */}
          <Suspense fallback={<ItemsListLoader />}>
            <FilterItemList queryType={queryType} feedId={params.feedId} folderId={params.folderId} showOnlyUnread={showOnlyUnread} setFeedArticleURL={setFeedArticleURL} />
          </Suspense>
          {/* Right Side */}
          {feedArticleURL != null ? (<FeedArticle url={feedArticleURL} />) : null}
        </section>
      </Main>
    </>
  )
}
