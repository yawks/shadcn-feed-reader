import { cn } from "@/lib/utils"

export function FeedArticle({ url }: { readonly url: string }) {
    return (
        <div
            className={cn(
                'absolute inset-0 left-full z-50 hidden w-full flex-1 flex-col rounded-md border bg-primary-foreground shadow-sm transition-all duration-200 sm:static sm:z-auto sm:flex',

            )}
        >
            <div className='mb-1 flex flex-none justify-between rounded-t-md bg-secondary p-4 shadow-lg h-full'>
                <iframe className='w-full h-full' src={url} title="Feed article" />
            </div>
        </div>
    )
}