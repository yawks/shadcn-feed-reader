import { FeedFilter, FeedQuery } from '@/backends/types'
import { useState } from 'react'
import { FeedQueryContext } from './feed-query-context'

export function FeedQueryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const initialQuery: FeedQuery = {
        feedType: undefined,
        feedFilter: FeedFilter.ALL,
        feedId: undefined,
        folderId: undefined,
    }
    const [feedQuery, setFeedQuery] = useState(initialQuery)

    return (
        <FeedQueryContext.Provider value={{ feedQuery: feedQuery, setFeedQuery: setFeedQuery }}>
            {children}
        </FeedQueryContext.Provider>
    )
}