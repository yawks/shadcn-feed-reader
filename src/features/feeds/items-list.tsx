import FeedBackend from '@/backends/nextcloud-news/nextcloud-news';
import { FeedItem } from '@/backends/types';
import { Fragment } from 'react/jsx-runtime';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { timeSince } from '@/lib/utils';

interface ItemsListProps {
  readonly items: Readonly<FeedItem[]>;
  readonly selectedFeedArticle: FeedItem | null;
  readonly setSelectedFeedArticle: (item: FeedItem | null) => void;
}

export function ItemsList({ items, selectedFeedArticle, setSelectedFeedArticle }: ItemsListProps) {
  const backend = new FeedBackend();
  return (
    <div className="flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80">
      <ScrollArea className="h-full">
        {items.map((item: FeedItem) => {
          const { id, title, feed, pubDate, thumbnailUrl } = item;
          return (
            <Fragment key={id}>
              <button
                className={`text-left w-full ${selectedFeedArticle != null && selectedFeedArticle.id == id ? 'bg-slate-200 dark:bg-slate-700' : ''} ${item.read ? 'text-muted-foreground' : ''}`}
                onClick={() => {
                  setSelectedFeedArticle(item)
                  backend.setFeedArticleRead(id)
                  item.read = true
                }
                }
              >
                <div className="flex gap-2 p-3">
                  {thumbnailUrl != '' ? (
                    <div className="flex-none items-center justify-center w-10 h-10 rounded-sm">
                      <img src={thumbnailUrl} alt={title} className="w-10 h-10 rounded-sm" />
                    </div>
                  ) : null}
                  <div>
                    <span className="flex-auto col-start-2 row-span-2 font-medium">{title}</span>
                    <span className="flex-auto col-start-2 row-span-2 row-start-2 line-clamp-2 text-ellipsis text-muted-foreground">
                      {feed?.title} {timeSince(pubDate?.getTime() ?? 0)}
                    </span>
                  </div>
                </div>
              </button>
              <Separator />
            </Fragment>
          );
        })}
      </ScrollArea>
    </div>
  );
}