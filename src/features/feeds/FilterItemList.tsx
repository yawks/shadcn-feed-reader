import { FeedFilter, FeedType } from "@/backends/types";

import FeedBackend from "@/backends/nextcloud-news/nextcloud-news";
import { ItemsList } from "./items-list";
import { useSuspenseQuery } from "@tanstack/react-query";

interface FilterItemsProps {
    readonly feedId: string | undefined;
    readonly folderId: string | undefined;
    readonly queryType: FeedType;
    readonly showOnlyUnread: boolean;
    readonly setFeedArticleURL: (url: string | null) => void; // Add this prop
}


export function FilterItemList({ feedId, folderId, queryType, showOnlyUnread, setFeedArticleURL }: FilterItemsProps) {
    const getFeedItems = async () => {

        const backend = new FeedBackend();

        const filter: FeedFilter = {
            id: String(feedId ?? folderId ?? ''),
            type: queryType,
            withUnreadItems: showOnlyUnread ?? false,
        }

        return await backend.getFeedItems(filter);
    }


    const { data } = useSuspenseQuery({
        queryKey: ['feeds', queryType, feedId ?? folderId],
        queryFn: getFeedItems,
    });

    return <ItemsList items={data} setFeedArticleURL={setFeedArticleURL} />;
};