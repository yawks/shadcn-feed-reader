import { useContext } from 'react'
import { FeedQueryContext } from './feed-query-context'

export function useFeedQuery() {
  const ctx = useContext(FeedQueryContext)
  if (!ctx) {
    throw new Error('useFeedQuery must be used within a FeedQueryProvider')
  }
  return ctx
}
