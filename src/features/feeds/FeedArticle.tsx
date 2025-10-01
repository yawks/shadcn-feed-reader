import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/tauri"

import { FeedItem } from "@/backends/types"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface FeedArticleProps {
    readonly item: FeedItem
    readonly isMobile?: boolean
}

export function FeedArticle({ item, isMobile = false }: FeedArticleProps) {
    const [isLoading, setIsLoading] = useState(true)
    const [articleContent, setArticleContent] = useState("")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchArticleContent = async () => {
            if (!item.url) return

            setIsLoading(true)
            setError(null)
            try {
                const content: string = await invoke("fetch_article", { url: item.url })
                setArticleContent(content)
            } catch (err) {
                setError(err as string)
            } finally {
                setIsLoading(false)
            }
        }

        fetchArticleContent()
    }, [item.url])

    return (
        <div
            className={cn(
                'flex flex-col rounded-md border bg-primary-foreground shadow-sm h-full w-full',
                {
                    'flex': isMobile,
                    'absolute inset-0 left-full z-50 hidden w-full flex-1 transition-all duration-200 sm:static sm:z-auto sm:flex': !isMobile,
                }
            )}
        >
            <div className='mb-1 flex flex-none justify-between rounded-t-md bg-secondary shadow-lg h-full relative overflow-auto'>
                {isLoading && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/80'>
                        <div className='flex flex-col items-center space-y-4'>
                            <Skeleton className='h-8 w-8 rounded-full animate-spin border-2 border-primary border-t-transparent' />
                            <p className='text-sm text-muted-foreground'>Loading article...</p>
                        </div>
                    </div>
                )}
                {error && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/80'>
                        <div className='flex flex-col items-center space-y-4'>
                            <p className='text-sm text-red-500'>{error}</p>
                        </div>
                    </div>
                )}
                {!isLoading && !error && (
                    <div
                        className='prose dark:prose-invert p-4 w-full'
                        dangerouslySetInnerHTML={{ __html: articleContent }}
                    />
                )}
            </div>
        </div>
    )
}