import { createContext } from 'react';
import { FeedQuery } from '@/backends/types';

export type FeedQueryContextType = {
    feedQuery: FeedQuery;
    setFeedQuery: (v: FeedQuery) => void;
};

export const FeedQueryContext = createContext<FeedQueryContextType | undefined>(undefined);
