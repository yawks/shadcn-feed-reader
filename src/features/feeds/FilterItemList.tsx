import { FeedItem, FeedQuery } from "@/backends/types";

import FeedBackend from "@/backends/nextcloud-news/nextcloud-news";
import { ItemsList } from "./items-list";
import { useSuspenseQuery } from "@tanstack/react-query";

interface FilterItemsProps {
    readonly feedQuery: FeedQuery;
    readonly selectedFeedArticle: FeedItem | null;
    readonly setSelectedFeedArticle: (item: FeedItem | null) => void;
}


export function FilterItemList({ feedQuery, selectedFeedArticle, setSelectedFeedArticle }: FilterItemsProps) {
    const getFeedItems = async () => {
        const backend = new FeedBackend();

        return await backend.getFeedItems(feedQuery);
    }


    const { data } = useSuspenseQuery({
        queryKey: ['feeds', feedQuery],
        queryFn: getFeedItems,
    });

    return <ItemsList items={data} selectedFeedArticle={selectedFeedArticle} setSelectedFeedArticle={setSelectedFeedArticle} />;
};