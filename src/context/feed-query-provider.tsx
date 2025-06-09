import { FeedFilter, FeedQuery } from '@/backends/types'
import { createContext, useContext, useState } from 'react'

type FeedQueryContextType = {
    feedQuery: FeedQuery
    setFeedQuery: (v: FeedQuery) => void
}

const FeedQueryContext = createContext<FeedQueryContextType | undefined>(undefined)

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

export function useFeedQuery() {
    const ctx = useContext(FeedQueryContext)
    if (!ctx) throw new Error('useFeedQuery must be used within FeedQueryProvider')
    return ctx
}