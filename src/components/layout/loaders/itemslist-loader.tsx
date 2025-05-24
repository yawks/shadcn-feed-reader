import { Fragment } from 'react/jsx-runtime'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function ItemLoader({ id }: { readonly id: string }) {
    return (
        <Fragment key={id}>
            <button
                type='button'
                className={cn(`-mx-1 flex w-full rounded-md px-2 py-2 text-left text-sm hover:bg-secondary/75 justify-center`)}>
                <div className='flex gap-2 w-9/10'>
                    <div className='w-12 h-10 rounded-sm bg-primary skeleton-loading' />
                    <div className='w-full'>
                        <span className='col-start-2 row-span-2 row-start-2 line-clamp-2 border bg-primary w-full h-2 rounded-sm text-muted-foreground skeleton-loading mb-2' />
                        <span className='col-start-2 row-span-2 row-start-2 line-clamp-2 border bg-primary w-full h-2 rounded-sm text-muted-foreground skeleton-loading mb-2' />
                        <span className='col-start-2 row-span-2 row-start-2 line-clamp-2 border bg-primary w-full h-2 rounded-sm text-muted-foreground skeleton-loading mb-2' />
                        <span className='col-start-2 row-span-2 row-start-2 line-clamp-2 border bg-primary w-full h-2 rounded-sm text-muted-foreground skeleton-loading mb-4' />
                        <span className='col-start-2 row-span-2 row-start-2 line-clamp-2 border bg-primary w-2/3 h-2 rounded-sm text-muted-foreground skeleton-loading' />
                    </div>
                </div>
            </button>
            <Separator className='my-1' />
        </Fragment>
    )
}

export function ItemsListLoader() {
    // Simulate items to be displayed while loading
    return (
        <div className='flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80 border-r border-r-gray'>
            <ScrollArea className='-mx-3 h-full p-3'>
                {Array.from({ length: 8 }, (_, index) => (
                    <ItemLoader key={index} id={String(index + 1)} />
                ))}
            </ScrollArea>
        </div>
    )
}