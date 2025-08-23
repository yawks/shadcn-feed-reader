import { useEffect, useState } from "react"

import { FeedItem } from "@/backends/types"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface FeedArticleProps {
    readonly item: FeedItem
    readonly isMobile?: boolean
}

export function FeedArticle({ item, isMobile = false }: FeedArticleProps) {
    const [isLoading, setIsLoading] = useState(true)

    // Remet l'état de loading à true quand l'URL de l'article change
    useEffect(() => {
        setIsLoading(true)
    }, [item.url])

    const handleLoad = () => {
        setIsLoading(false)
    }

    return (
        <div
            className={cn(
                'flex flex-col rounded-md border bg-primary-foreground shadow-sm h-full w-full',
                {
                    // Classes pour mobile : toujours visible et prend toute la place
                    'flex': isMobile,
                    // Classes pour desktop : comportement original
                    'absolute inset-0 left-full z-50 hidden w-full flex-1 transition-all duration-200 sm:static sm:z-auto sm:flex': !isMobile,
                }
            )}
        >
            <div className='mb-1 flex flex-none justify-between rounded-t-md bg-secondary shadow-lg h-full relative'>
                {isLoading && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/80'>
                        <div className='flex flex-col items-center space-y-4'>
                            <Skeleton className='h-8 w-8 rounded-full animate-spin border-2 border-primary border-t-transparent' />
                            <p className='text-sm text-muted-foreground'>Loading article...</p>
                        </div>
                    </div>
                )}
                <iframe 
                    className='w-full h-full' 
                    src={item.url} 
                    title="Feed article"
                    onLoad={handleLoad}
                />
            </div>
        </div>
    )
}