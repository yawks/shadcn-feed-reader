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

// Consumer hook for accessing the FeedQuery context
// Throws when used outside a Provider to make errors easier to diagnose.
// NOTE: Consumer hook `useFeedQuery` moved to `src/context/use-feed-query.ts` to avoid
// exporting non-component helpers from a file that also exports a React component
// which can interfere with fast refresh. See that file for the hook implementation.