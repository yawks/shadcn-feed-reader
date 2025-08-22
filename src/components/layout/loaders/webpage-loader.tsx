import { Book, FileText } from 'lucide-react'

export function WebPageLoader() {
    return (
        <div className='flex flex-col items-center justify-center w-full h-full text-muted-foreground/40'>
            <div className='flex items-center gap-3 mb-4'>
                <Book className='h-8 w-8' />
                <FileText className='h-6 w-6' />
            </div>
            <p className='text-sm font-medium opacity-60'>
                Select an article to read
            </p>
        </div>
    )
}