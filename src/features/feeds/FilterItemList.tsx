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

        // Expose les méthodes pour contrôler le scroll depuis le parent
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

        // Déclenche onScrollEnd uniquement si l'utilisateur scrolle vers le bas
        const lastScrollTop = useRef(0);
        const previousItemsLength = useRef(items.length);
        const isLoadingMore = useRef(false);
        const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

        // Maintenir la position de scroll quand les items changent
        useEffect(() => {
            if (items.length > previousItemsLength.current) {
                // De nouveaux items ont été ajoutés
                isLoadingMore.current = true;
                const el = scrollRef.current;
                if (el) {
                    // Sauvegarder la position actuelle
                    const savedScrollTop = el.scrollTop;
                    
                    // Attendre que le DOM soit mis à jour
                    if (scrollTimeout.current) {
                        clearTimeout(scrollTimeout.current);
                    }
                    
                    scrollTimeout.current = setTimeout(() => {
                        if (el) {
                            // Forcer la restauration de la position
                            el.scrollTop = savedScrollTop;
                        }
                        isLoadingMore.current = false;
                        scrollTimeout.current = null;
                    }, 100);
                }
            }
            previousItemsLength.current = items.length;
        }, [items.length]);

        // Nettoyer le timeout au démontage
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
            
            // Ignorer les changements de scroll internes (setScrollTop)
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