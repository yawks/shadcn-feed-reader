import { Fragment } from 'react/jsx-runtime'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

export function ItemLoader({ id }: { readonly id: string }) {
    return (
        <Fragment key={id}>
            <div className='flex w-full rounded-md px-2 py-2 gap-2'>
                <div className='w-12 h-10 rounded-sm bg-primary skeleton-loading flex-shrink-0' />
                <div className='flex-1 min-w-0 space-y-2'>
                    <div className='bg-primary h-2 rounded-sm skeleton-loading w-full' />
                    <div className='bg-primary h-2 rounded-sm skeleton-loading w-full' />
                    <div className='bg-primary h-2 rounded-sm skeleton-loading w-full' />
                    <div className='bg-primary h-2 rounded-sm skeleton-loading w-4/5' />
                    <div className='bg-primary h-2 rounded-sm skeleton-loading w-2/3' />
                </div>
            </div>
            <Separator className='my-1' />
        </Fragment>
    )
}

export function ItemsListLoader() {
    // Simulate items to be displayed while loading
    return (
        <ScrollArea className='h-full w-full'>
            <div className='flex w-full flex-col gap-2 p-3'>
                {Array.from({ length: 8 }, (_, index) => (
                    <ItemLoader key={index} id={String(index + 1)} />
                ))}
            </div>
        </ScrollArea>
    )
}