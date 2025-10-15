import { GroupedFeedItem } from '@/utils/grouping';
import { useState } from 'react';
import { FeedFavicon } from '@/components/ui/feed-favicon';
import { timeSinceShort } from '@/lib/utils';
import { FeedItem } from '@/backends/types';

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
      <div
        className={`
          group relative w-full text-left rounded-lg p-3 transition-all duration-300 ease-in-out
          border
          ${isSelected ? 'bg-primary/10 border-primary/20 shadow-md' : 'bg-background/80 border-transparent hover:border-border/40'}
        `}
      >
        {/* Main Article Content */}
        <button
          className="w-full text-left focus:outline-none"
          onClick={handleCardClick}
        >
          {/* Group Title */}
          <h2 className="text-sm font-semibold mb-2 px-1 text-foreground/80">{group.title}</h2>

          {/* Main Article Layout */}
          <div className="space-y-2">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-md overflow-hidden bg-muted/50 ring-1 ring-border/10">
                  <img
                    src={mainArticle.thumbnailUrl || '/public/images/feed_icon.png'}
                    alt={mainArticle.title}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1 overflow-x-hidden">
                <h3 className="font-medium leading-tight line-clamp-4 text-foreground group-hover:text-foreground">
                  {mainArticle.title}
                </h3>
              </div>
            </div>
            {/* Source Favicons */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 pl-1">
                {sources.slice(0, 5).map((source, index) => (
                  <FeedFavicon
                    key={index}
                    src={source.faviconUrl}
                    alt={source.title}
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                  />
                ))}
                 {sources.length > 5 && <span className="text-xs text-muted-foreground/80">+{sources.length - 5}</span>}
              </div>
               <time className="text-xs text-muted-foreground/80 whitespace-nowrap flex-shrink-0">
                {timeSinceShort(mainArticle.pubDate?.getTime() ?? 0)}
              </time>
            </div>
          </div>
        </button>

        {/* Stack Effect & Badge */}
        <div className={`
          absolute bottom-0 left-0 right-0 px-2 pointer-events-none
          transition-opacity duration-300 ease-in-out
          ${isExpanded ? 'opacity-0' : 'opacity-100'}
        `}>
          {articles.slice(0, 2).map((_, index) => (
            <div
              key={index}
              className="h-[2px] bg-border/50 rounded-full mx-auto mt-1"
              style={{
                width: `${95 - (index * 5)}%`,
                transform: `translateY(${ (index + 1) * -2 }px)`
              }}
            />
          ))}
          <div className="absolute bottom-1 right-2 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
            +{articles.length}
          </div>
        </div>

        {/* Expanded View */}
        <div className={`
          transition-all ease-in-out duration-500 overflow-hidden
          ${isExpanded ? 'max-h-96 mt-4 border-t border-border/40 pt-3' : 'max-h-0'}
        `}>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Autres articles du dossier :</h4>
          <div className="space-y-3">
            {articles.map(article => (
              <button
                key={article.id}
                className="w-full text-left flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/80"
                onClick={() => onSelect(article)}
              >
                <FeedFavicon
                  src={article.feed?.faviconUrl}
                  alt={article.feed?.title}
                  className="w-4 h-4 rounded-sm flex-shrink-0"
                />
                <span className="text-sm text-muted-foreground truncate flex-1">{article.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
