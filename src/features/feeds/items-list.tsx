import FeedBackend from '@/backends/nextcloud-news/nextcloud-news';
import { FeedFavicon } from '@/components/ui/feed-favicon';
import { FeedItem } from '@/backends/types';
import { timeSince } from '@/lib/utils';

interface ItemsListProps {
  readonly items: Readonly<FeedItem[]>;
  readonly selectedFeedArticle: FeedItem | null;
  readonly setSelectedFeedArticle: (item: FeedItem | null) => void;
}

function getTitleColor(isSelected: boolean, isUnread: boolean): string {
  if (isSelected) return 'text-primary';
  if (isUnread) return 'text-foreground';
  return 'text-muted-foreground';
}

export function ItemsList({ items, selectedFeedArticle, setSelectedFeedArticle }: ItemsListProps) {
  const backend = new FeedBackend();

  return (
    <div className="flex w-full flex-col border-r border-border/40">
      <div className="h-full overflow-y-auto">
        <div className="space-y-1 p-2">
          {items.map((item: FeedItem) => {
            const { id, title, feed, pubDate, thumbnailUrl } = item;
            const isSelected = selectedFeedArticle?.id === id;
            const isUnread = !item.read;

            return (
              <div key={id} className="relative">
                <button
                  className={`
                    group relative w-full text-left rounded-lg p-3 transition-all duration-200 ease-in-out
                    hover:bg-accent/60 hover:shadow-sm hover:scale-[1.02]
                    focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                    ${isSelected
                      ? 'bg-primary/10 border border-primary/20 shadow-md'
                      : 'bg-background/80 border border-transparent hover:border-border/40'
                    }
                    ${isUnread ? 'font-medium' : 'text-muted-foreground'}
                  `}
                  onClick={() => {
                    setSelectedFeedArticle(item)
                    backend.setFeedArticleRead(id.toString())
                    item.read = true
                  }}
                >
                  {/* Indicateur d'article non lu */}
                  {isUnread && (
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full shadow-sm"></div>
                  )}

                  <div className={`flex gap-3 ${isUnread ? 'ml-3' : ''}`}>
                    <div className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden bg-muted/50 ring-1 ring-border/10">
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

                    <div className="flex-1 min-w-0 space-y-1 overflow-x-hidden">
                      <h3 className={`
                        font-medium leading-tight line-clamp-4
                        ${getTitleColor(isSelected, isUnread)}
                        group-hover:text-foreground transition-colors duration-200
                      `}>
                        {title}
                      </h3>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          {feed?.faviconUrl && (
                            <FeedFavicon
                              src={feed.faviconUrl}
                              alt={feed.title}
                              className="w-3 h-3 rounded-sm flex-shrink-0"
                            />
                          )}
                          <span className="font-medium truncate">{feed?.title}</span>
                        </div>
                        <span className="text-muted-foreground/60">•</span>
                        <time className="whitespace-nowrap">{timeSince(pubDate?.getTime() ?? 0)}</time>
                      </div>
                    </div>
                  </div>

                  {/* Effet de sélection avec animation */}
                  {isSelected && (
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/5 to-transparent pointer-events-none"></div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}