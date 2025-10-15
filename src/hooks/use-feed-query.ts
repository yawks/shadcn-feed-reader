import { useContext } from 'react';
import { FeedQueryContext } from '../context/feed-query-context';

export function useFeedQuery() {
    const ctx = useContext(FeedQueryContext);
    if (!ctx) throw new Error('useFeedQuery must be used within FeedQueryProvider');
    return ctx;
}
