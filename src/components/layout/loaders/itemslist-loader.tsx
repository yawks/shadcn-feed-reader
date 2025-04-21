import { Fragment } from 'react/jsx-runtime'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function ItemLoader({ id }: { readonly id: string }) {
    return (
        <Fragment key={id}>
            <button
                type='button'
                className={cn(`-mx-1 flex w-full rounded-md px-2 py-2 text-left text-sm hover:bg-secondary/75`)}>
                <div className='flex gap-2'>
                    <div className='flex items-center justify-center w-10 h-10 rounded-sm skeleton-loading bg-primary text-primary-foreground' />
                    <div>
                        <span className='col-start-2 mb-2 row-span-2 font-medium w-55 h-6 bg-primary text-primary-foreground border rounded-sm skeleton-loading line-clamp-1' />
                        <span className='col-start-2 row-span-2 row-start-2 line-clamp-2 border bg-primary text-primary-foreground w-55 h-2 rounded-xs text-muted-foreground skeleton-loading' />
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
        <div className='flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80'>
            <ScrollArea className='-mx-3 h-full p-3'>
                {Array.from({ length: 8 }, (_, index) => (
                    <ItemLoader key={index} id={String(index + 1)} />
                ))}
            </ScrollArea>
        </div>
    )
}