import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function WebPageLoader() {
    return (
        <div className='flex justify-center w-full h-full opacity-5 mt-10'>
            <button
                type='button'
                className={cn(`-mx-1 flex rounded-md px-2 py-2 text-sm hover:bg-secondary/75 w-8/10`)}>
                <div className='gap-2 w-full'>
                    {/* title */}
                    <div className='h-6 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='w-2/3 h-6 rounded-sm bg-primary text-primary-foreground mb-3' />
                    
                    {/* subtitle */}
                    <div className='h-3 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-3 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='w-3/4 h-3 rounded-sm bg-primary text-primary-foreground mb-6' />
                    
                    {/* main picture & caption */}
                    <div className='h-50 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-1 rounded-sm bg-primary text-primary-foreground mb-1.5' />
                    <div className='w-1/3 h-1 rounded-sm bg-primary text-primary-foreground mb-6' />
                    
                    {/* paragraph */}
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='w-1/2 h-2 rounded-sm bg-primary text-primary-foreground mb-6' />

                    {/* paragraph */}
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='w-2/3 h-2 rounded-sm bg-primary text-primary-foreground mb-6' />

                    {/* paragraph */}
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='h-2 rounded-sm bg-primary text-primary-foreground mb-2' />
                    <div className='w-1/6 h-2 rounded-sm bg-primary text-primary-foreground mb-6' />

                </div>
            </button>
        </div>
    )
}