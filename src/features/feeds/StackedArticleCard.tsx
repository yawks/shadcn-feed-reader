import { FeedFavicon } from '@/components/ui/feed-favicon';
import { FeedItem } from '@/backends/types';
import { GroupedFeedItem } from '@/utils/grouping';
import { timeSinceShort } from '@/lib/utils';
import { useState } from 'react';

interface StackedArticleCardProps {
  group: GroupedFeedItem;
  // These props will be needed for consistency with ItemsList
  isSelected: boolean;
  onSelect: (item: FeedItem) => void;
}

export function StackedArticleCard({ group, isSelected, onSelect }: StackedArticleCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { mainArticle, articles, sources } = group;

  const handleCardClick = () => {
    // If not selected, first select it (which shows it in the right panel on desktop)
    // and expand it.
    if (!isSelected) {
      onSelect(mainArticle);
      setIsExpanded(true);
    } else {
      // If already selected, toggle expansion
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className="relative">
      <button
        className={`
          group relative w-full text-left rounded-lg p-3 transition-all duration-200 ease-in-out
          hover:bg-accent/60 hover:shadow-sm hover:scale-[1.02]
          focus:outline-none
          ${isSelected
            ? 'bg-primary/10 border border-primary/20 shadow-md'
            : 'bg-background/80 border border-transparent hover:border-border/40'
          }
        `}
        onClick={handleCardClick}
      >
        <div className="space-y-2 pb-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <div className={`
                w-12 h-12 rounded-md overflow-hidden bg-muted/50 ring-1 transition-all duration-200
                ${!mainArticle.read ? 'ring-primary ring-2' : 'ring-border/10'}
              `}>
                <img
                  src={mainArticle.thumbnailUrl || '/public/images/feed_icon.png'}
                  alt={mainArticle.title}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-1 overflow-x-hidden">
              <h3 className={`
                font-medium leading-tight line-clamp-4
                ${!mainArticle.read ? 'font-medium' : 'text-muted-foreground'}
                group-hover:text-foreground transition-colors duration-200
              `}>
                {mainArticle.title}
              </h3>
            </div>
          </div>
          {/* Source Info */}
          <div className="flex items-center justify-between gap-2 text-muted-foreground/80">
            <div className="flex items-center gap-1 min-w-0">
              {mainArticle.feed?.faviconUrl && (
                <FeedFavicon
                  src={mainArticle.feed.faviconUrl}
                  alt={mainArticle.feed.title}
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                />
              )}
              <span className="text-xs font-medium truncate">
                {mainArticle.feed?.title}
              </span>
              {sources.length > 1 && (
                <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-md font-medium">
                  +{sources.length - 1}
                </span>
              )}
            </div>
            <time className="text-xs whitespace-nowrap flex-shrink-0">{timeSinceShort(mainArticle.pubDate?.getTime() ?? 0)}</time>
          </div>
        </div>
        {isSelected && (
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/5 to-transparent pointer-events-none"></div>
        )}
        {/* Expanded View */}
        <div className={`
          transition-all ease-in-out duration-500 overflow-hidden
          ${isExpanded ? 'max-h-96 border-t border-border/40 pt-3' : 'max-h-0'}
        `}>
          <div className="space-y-2">
            {articles.map(article => (
              <button
                key={article.id}
                className="w-full text-left p-2 rounded-md hover:bg-accent/80 transition-colors duration-200"
                onClick={() => onSelect(article)}
              >
                {/* Header: miniature + titre */}
                <div className="flex flex-row items-center gap-2">
                  <div className="flex-shrink-0">
                    <div className={`
                      w-8 h-8 rounded-md overflow-hidden bg-muted/50 ring-1 transition-all duration-200
                      ${!article.read ? 'ring-primary ring-2' : 'ring-border/10'}
                    `}>
                      <img
                        src={article.thumbnailUrl || '/public/images/feed_icon.png'}
                        alt={article.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <h4 className={`
                    text-xs leading-tight line-clamp-2 flex-1
                    ${!article.read ? 'font-medium' : 'text-muted-foreground'}
                  `}>
                    {article.title}
                  </h4>
                </div>
                {/* Footer: favicon + nom + timestamp sur toute la largeur */}
                <div className="flex items-center gap-1 text-muted-foreground/80 mt-1 w-full mt-2">
                  {article.feed?.faviconUrl && (
                    <FeedFavicon
                      src={article.feed.faviconUrl}
                      alt={article.feed.title}
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                    />
                  )}
                  <span className="text-xs truncate">
                    {article.feed?.title}
                  </span>
                  <span className="flex-1" />
                  <time className="text-xs whitespace-nowrap flex-shrink-0">
                    {timeSinceShort(article.pubDate?.getTime() ?? 0)}
                  </time>
                </div>
              </button>
            ))}
          </div>
        </div>
      </button>
    </div>
  );
}
