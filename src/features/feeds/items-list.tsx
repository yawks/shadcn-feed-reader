import { FeedItem } from '@/backends/types';
import { Fragment } from 'react/jsx-runtime';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { timeSince } from '@/lib/utils';

interface ItemsListProps {
  readonly items: Readonly<FeedItem[]>;
  readonly setFeedArticleURL: (url: string | null) => void; // Add this prop
}

export function ItemsList({ items, setFeedArticleURL }: ItemsListProps) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80">
      <ScrollArea className="-mx-3 h-full p-3">
        {items.map((item: FeedItem) => {
          const { id, title, feed, pubDate, thumbnailUrl, url } = item;
          return (
            <Fragment key={id}>
              <button className='text-left' onClick={() => setFeedArticleURL(url)}>
                <div className="flex gap-2">
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
              <Separator className="my-1" />
            </Fragment>
          );
        })}
      </ScrollArea>
    </div>
  );
}