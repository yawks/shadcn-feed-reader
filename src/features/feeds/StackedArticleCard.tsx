import { FeedFavicon } from '@/components/ui/feed-favicon';
import { FeedItem } from '@/backends/types';
import { GroupedFeedItem } from '@/utils/grouping';
import { timeSinceShort } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface StackedArticleCardProps {
  group: GroupedFeedItem;
  isSelected: boolean;
  onSelect: (item: FeedItem) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onExpand: () => void;
}

export function StackedArticleCard({ group, isSelected, onSelect, isExpanded, onToggleExpand, onExpand }: StackedArticleCardProps) {
  const { mainArticle, articles, sources } = group;
  const isMobile = useIsMobile();

  const handleCardClick = () => {
    if (isMobile) {
      // On mobile a tap toggles the group's expanded state only
      onToggleExpand();
      return;
    }

    // Desktop behavior: select the article when opening the group, toggle when already selected
    if (!isSelected) {
      onSelect(mainArticle);
      onExpand();
    } else {
      onToggleExpand();
    }
  };

  return (
    <div className="relative">
      {/* Collapsed card */}
      <div
        role="button"
        tabIndex={0}
        className={`group relative w-full text-left rounded-lg p-3 transition-all duration-200 ease-in-out hover:bg-accent/60 hover:shadow-sm focus:outline-none ${isSelected ? 'bg-primary/10 border border-primary/20 shadow-md' : 'bg-background/80 border border-transparent hover:border-border/40'}`}
        onClick={handleCardClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') handleCardClick();
        }}
        style={{ cursor: 'pointer' }}
      >
        <div className="space-y-2 pb-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
                <div className={`w-12 h-12 rounded-md overflow-hidden bg-muted/50 ring-1 transition-all duration-200 ${!mainArticle.read ? 'ring-primary ring-2' : 'ring-border/10'}`}>
                <img
                  src={mainArticle.thumbnailUrl || '/images/feed_icon.png'}
                  alt={mainArticle.title}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  onError={e => {
                    const target = e.currentTarget;
                    if (!target.src.includes('/images/feed_icon.png')) {
                      target.src = '/images/feed_icon.png';
                    } else if (!target.dataset.fallbackTried) {
                      target.dataset.fallbackTried = 'true';
                      target.style.opacity = '0.3';
                      target.style.backgroundColor = 'var(--muted)';
                      target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1 overflow-x-hidden">
              <h3 className={`feed-item-title font-medium leading-tight line-clamp-4 ${!mainArticle.read ? 'font-medium' : 'text-muted-foreground'} group-hover:text-foreground transition-colors duration-200`}>
                {mainArticle.title}
              </h3>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-muted-foreground/80">
            <div className="flex items-center gap-1 min-w-0">
              {mainArticle.feed?.faviconUrl && <FeedFavicon src={mainArticle.feed.faviconUrl} alt={mainArticle.feed.title} className="w-3 h-3 rounded-sm flex-shrink-0" />}
              <span className="text-xs font-medium truncate">{mainArticle.feed?.title}</span>
              {sources.length > 1 && <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-md font-medium">+{sources.length - 1}</span>}
            </div>
            <time className="text-xs whitespace-nowrap flex-shrink-0">{timeSinceShort(mainArticle.pubDate?.getTime() ?? 0)}</time>
          </div>
        </div>

        {isSelected && <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />}
      </div>

      {/* Expanded list */}
      {isExpanded && (
        <div className="transition-all ease-in-out duration-500 overflow-hidden max-h-96 border-t border-border/40 pt-3">
          <div className="pl-4 pr-1 relative">
            <div className="absolute left-2 top-0 bottom-0 w-[2px] bg-border dark:bg-white/30" aria-hidden />

            <div className="space-y-3">
              {isMobile && (
                <div>
                  <button
                    key={mainArticle.id}
                    className="w-full text-left p-2 rounded-md hover:bg-accent/80 transition-colors duration-200 ml-2"
                    onClick={e => {
                      e.stopPropagation();
                      onSelect(mainArticle);
                    }}
                  >
                    <div className="flex flex-row items-center gap-2">
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-md overflow-hidden bg-muted/50 ring-1 transition-all duration-200 ${!mainArticle.read ? 'ring-primary ring-2' : 'ring-border/10'}`}>
                          <img
                            src={mainArticle.thumbnailUrl || '/images/feed_icon.png'}
                            alt={mainArticle.title}
                            className="w-full h-full object-cover"
                            onError={e => {
                              const target = e.currentTarget;
                              if (!target.src.includes('/images/feed_icon.png')) {
                                target.src = '/images/feed_icon.png';
                              } else if (!target.dataset.fallbackTried) {
                                target.dataset.fallbackTried = 'true';
                                target.style.opacity = '0.3';
                                target.style.backgroundColor = 'var(--muted)';
                                target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                              }
                            }}
                          />
                        </div>
                      </div>

                      <h4 className={`feed-item-title leading-tight line-clamp-2 flex-1 ${!mainArticle.read ? 'font-medium' : 'text-muted-foreground'}`}>{mainArticle.title}</h4>
                    </div>

                    <div className="flex items-center gap-1 text-muted-foreground/80 mt-1 w-full">
                      {mainArticle.feed?.faviconUrl && <FeedFavicon src={mainArticle.feed.faviconUrl} alt={mainArticle.feed.title} className="w-3 h-3 rounded-sm flex-shrink-0" />}
                      <span className="text-xs truncate">{mainArticle.feed?.title}</span>
                      <span className="flex-1" />
                      <time className="text-xs whitespace-nowrap flex-shrink-0">{timeSinceShort(mainArticle.pubDate?.getTime() ?? 0)}</time>
                    </div>
                  </button>
                </div>
              )}

              {articles.map(article => (
                <div key={article.id}>
                  <button
                    className="w-full text-left p-2 rounded-md hover:bg-accent/80 transition-colors duration-200 ml-2"
                    onClick={e => {
                      e.stopPropagation();
                      onSelect(article);
                    }}
                  >
                    <div className="flex flex-row items-center gap-2">
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-md overflow-hidden bg-muted/50 ring-1 transition-all duration-200 ${!article.read ? 'ring-primary ring-2' : 'ring-border/10'}`}>
                          <img
                            src={article.thumbnailUrl || '/images/feed_icon.png'}
                            alt={article.title}
                            className="w-full h-full object-cover"
                            onError={e => {
                              const target = e.currentTarget;
                              if (!target.src.includes('/images/feed_icon.png')) {
                                target.src = '/images/feed_icon.png';
                              } else if (!target.dataset.fallbackTried) {
                                target.dataset.fallbackTried = 'true';
                                target.style.opacity = '0.3';
                                target.style.backgroundColor = 'var(--muted)';
                                target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                              }
                            }}
                          />
                        </div>
                      </div>

                      <h4 className={`feed-item-title leading-tight line-clamp-2 flex-1 ${!article.read ? 'font-medium' : 'text-muted-foreground'}`}>{article.title}</h4>
                    </div>

                    <div className="flex items-center gap-1 text-muted-foreground/80 mt-1 w-full">
                      {article.feed?.faviconUrl && <FeedFavicon src={article.feed.faviconUrl} alt={article.feed.title} className="w-3 h-3 rounded-sm flex-shrink-0" />}
                      <span className="text-xs truncate">{article.feed?.title}</span>
                      <span className="flex-1" />
                      <time className="text-xs whitespace-nowrap flex-shrink-0">{timeSinceShort(article.pubDate?.getTime() ?? 0)}</time>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
