import { ProcessedFeedItem, isGroupedFeedItem } from '@/utils/grouping';

import FeedBackend from '@/backends/nextcloud-news/nextcloud-news';
import { FeedFavicon } from '@/components/ui/feed-favicon';
import { FeedItem } from '@/backends/types';
import { StackedArticleCard } from './StackedArticleCard';
import { timeSinceShort } from '@/lib/utils';

interface ItemsListProps {
  readonly items: Readonly<ProcessedFeedItem[]>;
  readonly selectedFeedArticle: FeedItem | null;
  readonly setSelectedFeedArticle: (item: FeedItem | null) => void;
  readonly expandedGroups: Record<string, boolean>;
  readonly setExpandedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

function getTitleColor(isSelected: boolean, isUnread: boolean): string {
  if (isSelected) return 'text-primary';
  if (isUnread) return 'text-foreground';
  return 'text-muted-foreground';
}

function SingleArticleCard({ item, isSelected, onSelect }: { item: FeedItem, isSelected: boolean, onSelect: () => void }) {
  const { id, title, feed, pubDate, thumbnailUrl } = item;
  const isUnread = !item.read;

  return (
    <div key={id} className="relative">
      <button
        className={`
          group relative w-full text-left rounded-lg p-3 transition-all duration-200 ease-in-out
          hover:bg-accent/60 hover:shadow-sm
          focus:outline-none
          ${isSelected
            ? 'bg-primary/10 border border-primary/20 shadow-md'
            : 'bg-background/80 border border-transparent hover:border-border/40'
          }
          ${isUnread ? 'font-medium' : 'text-muted-foreground'}
        `}
        onClick={onSelect}
      >
        <div className="space-y-2">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <div className={`
                w-12 h-12 rounded-md overflow-hidden bg-muted/50 ring-1 transition-all duration-200
                ${isUnread ? 'ring-primary ring-2' : 'ring-border/10'}
              `}>
                <img
                  src={thumbnailUrl || '/public/images/feed_icon.png'}
                  alt={title}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  onError={e => {
                    const target = e.currentTarget;
                    if (target.src.indexOf('/public/images/feed_icon.png') === -1) {
                      target.src = '/public/images/feed_icon.png';
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-1 overflow-x-hidden">
              <h3 className={`
                feed-item-title font-medium leading-tight line-clamp-4
                ${getTitleColor(isSelected, isUnread)}
                group-hover:text-foreground transition-colors duration-200
              `}>
                {title}
              </h3>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-muted-foreground/80">
            <div className="flex items-center gap-1 min-w-0">
              {feed?.faviconUrl && (
                <FeedFavicon
                  src={feed.faviconUrl}
                  alt={feed.title}
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                />
              )}
              <span className="text-xs font-medium truncate">
                {feed?.title}
              </span>
            </div>
            <time className="text-xs whitespace-nowrap flex-shrink-0">{timeSinceShort(pubDate?.getTime() ?? 0)}</time>
          </div>
        </div>
        {isSelected && (
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/5 to-transparent pointer-events-none"></div>
        )}
      </button>
    </div>
  );
}




export function ItemsList({ items, selectedFeedArticle, setSelectedFeedArticle, expandedGroups, setExpandedGroups }: ItemsListProps) {
  const backend = new FeedBackend();

  const handleSelectArticle = (item: FeedItem) => {
    setSelectedFeedArticle(item);
    if (!item.read) {
      backend.setFeedArticleRead(item.id.toString());
      item.read = true; // Optimistic update
    }
  };

  const handleToggleExpand = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleExpand = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: true,
    }));
  };

  return (
    <div className="flex w-full flex-col border-r border-border/40">
      <div className="h-full overflow-y-auto">
        <div className="space-y-1 py-1 mr-0.5">
          {items.map((item: ProcessedFeedItem) => {
            if (isGroupedFeedItem(item)) {
              const isGroupSelected = selectedFeedArticle ?
                item.articles.some(a => a.id === selectedFeedArticle.id) || item.mainArticle.id === selectedFeedArticle.id
                : false;
              const isExpanded = !!expandedGroups[item.id];
              return (
                <StackedArticleCard
                  key={item.id}
                  group={item}
                  isSelected={isGroupSelected}
                  onSelect={handleSelectArticle}
                  isExpanded={isExpanded}
                  onToggleExpand={() => handleToggleExpand(item.id)}
                  onExpand={() => handleExpand(item.id)}
                />
              );
            } else {
              const isSelected = selectedFeedArticle?.id === item.id;
              return (
                <SingleArticleCard
                  key={item.id}
                  item={item}
                  isSelected={isSelected}
                  onSelect={() => handleSelectArticle(item)}
                />
              );
            }
          })}
        </div>
      </div>
    </div>
  );
}