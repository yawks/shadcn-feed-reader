import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { FeedItem } from "@/backends/types";
import { ItemsList } from "./items-list";
import { ItemsListLoader } from "@/components/layout/loaders/itemslist-loader";

export interface FilterItemListRef {
    getScrollTop: () => number;
    setScrollTop: (position: number) => void;
}

interface FilterItemsProps {
    readonly items: FeedItem[];
    readonly selectedFeedArticle: FeedItem | null;
    readonly setSelectedFeedArticle: (item: FeedItem | null) => void;
    readonly onScrollEnd: () => void;
    readonly isFetchingNextPage?: boolean;
}

export const FilterItemList = forwardRef<FilterItemListRef, FilterItemsProps>(
    function FilterItemList({ items, selectedFeedArticle, setSelectedFeedArticle, onScrollEnd, isFetchingNextPage }, ref) {
        const scrollRef = useRef<HTMLDivElement>(null);
        const isInternalScrollChange = useRef(false);

        // Expose methods to control scroll from parent
        useImperativeHandle(ref, () => ({
            getScrollTop: () => scrollRef.current?.scrollTop || 0,
            setScrollTop: (position: number) => {
                if (scrollRef.current) {
                    isInternalScrollChange.current = true;
                    scrollRef.current.scrollTop = position;
                    setTimeout(() => {
                        isInternalScrollChange.current = false;
                    }, 100);
                }
            }
        }));

        // Trigger onScrollEnd only when user scrolls down
        const lastScrollTop = useRef(0);
        const previousItemsLength = useRef(items.length);
        const isLoadingMore = useRef(false);
        const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

        // Maintain scroll position when items change
        useEffect(() => {
            if (items.length > previousItemsLength.current) {
                // New items have been added
                isLoadingMore.current = true;
                const el = scrollRef.current;
                if (el) {
                    // Save current position
                    const savedScrollTop = el.scrollTop;
                    
                    // Wait for DOM to be updated
                    if (scrollTimeout.current) {
                        clearTimeout(scrollTimeout.current);
                    }
                    
                    scrollTimeout.current = setTimeout(() => {
                        if (el) {
                            // Force position restoration
                            el.scrollTop = savedScrollTop;
                        }
                        isLoadingMore.current = false;
                        scrollTimeout.current = null;
                    }, 100);
                }
            }
            previousItemsLength.current = items.length;
        }, [items.length]);

        // Clean up timeout on unmount
        useEffect(() => {
            return () => {
                if (scrollTimeout.current) {
                    clearTimeout(scrollTimeout.current);
                }
            };
        }, []);

        const handleScroll = () => {
            const el = scrollRef.current;
            if (!el) return;
            
            // Ignore internal scroll changes (setScrollTop)
            if (isInternalScrollChange.current) return;
            
            const isScrollingDown = el.scrollTop > lastScrollTop.current;
            if (
                isScrollingDown &&
                el.scrollTop + el.clientHeight >= el.scrollHeight - 10 &&
                !isLoadingMore.current
            ) {
                onScrollEnd();
            }
            lastScrollTop.current = el.scrollTop;
        };

        return (
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-border/80"
            >
                <ItemsList
                    items={items}
                    selectedFeedArticle={selectedFeedArticle}
                    setSelectedFeedArticle={setSelectedFeedArticle}
                />
                <div className="w-full py-2 min-h-[60px]">
                    {isFetchingNextPage && <ItemsListLoader />}
                </div>
            </div>
        );
    }
);