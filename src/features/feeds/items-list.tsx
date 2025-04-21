import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { FeedItem } from '@/backends/types'
import { Fragment } from 'react/jsx-runtime'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface ItemsListProps {
    readonly items: Readonly<FeedItem[]>;
}

export function ItemsList({ items: items }: ItemsListProps) {
    const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null)
    const [, setMobileSelectedItem] = useState<FeedItem | null>(null)

    return (<div className='flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80'>
        <ScrollArea className='-mx-3 h-full p-3'>
            {items.map((item) => {
                const { id, title, feed, pubDate, thumbnailUrl } = item
                return (
                    <Fragment key={id}>
                        <button
                            type='button'
                            className={cn(
                                `-mx-1 flex w-full rounded-md px-2 py-2 text-left text-sm hover:bg-secondary/75`,
                                selectedItem?.id === id && 'sm:bg-muted'
                            )}
                            onClick={() => {
                                setSelectedItem(item)
                                setMobileSelectedItem(item)
                            }}
                        >
                            <div className='flex gap-2'>
                                <Avatar>
                                    <AvatarImage src={thumbnailUrl} alt={title} />
                                    <AvatarFallback>{title}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <span className='col-start-2 row-span-2 font-medium'>
                                        {title}
                                    </span>
                                    <span className='col-start-2 row-span-2 row-start-2 line-clamp-2 text-ellipsis text-muted-foreground'>
                                        {feed?.title} - {pubDate?.toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                        })}
                                    </span>
                                </div>
                            </div>
                        </button>
                        <Separator className='my-1' />
                    </Fragment>
                )
            })}
        </ScrollArea>
    </div>
    )
}