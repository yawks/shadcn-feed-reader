import { FeedItem } from "@/backends/types";
import { ItemsList } from "./items-list";
import { useRef } from "react";

interface FilterItemsProps {
    readonly items: FeedItem[];
    readonly selectedFeedArticle: FeedItem | null;
    readonly setSelectedFeedArticle: (item: FeedItem | null) => void;
    readonly onScrollEnd: () => void;
}

export function FilterItemList({ items, selectedFeedArticle, setSelectedFeedArticle, onScrollEnd }: FilterItemsProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Déclenche onScrollEnd uniquement si l'utilisateur scrolle vers le bas
    const lastScrollTop = useRef(0);

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const isScrollingDown = el.scrollTop > lastScrollTop.current;
        if (
            isScrollingDown &&
            el.scrollTop + el.clientHeight >= el.scrollHeight - 10
        ) {
            onScrollEnd();
        }
        lastScrollTop.current = el.scrollTop;
    };

    return (
        <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{ overflowY: 'auto', height: '100%' }}
        >
            <ItemsList
                items={items}
                selectedFeedArticle={selectedFeedArticle}
                setSelectedFeedArticle={setSelectedFeedArticle}
            />
        </div>
    );
}