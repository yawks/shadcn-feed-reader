import { useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useEffect } from 'react'

interface GeneralErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  minimal?: boolean
  error?: Error
  reset?: () => void
}

export default function GeneralError({
  className,
  minimal = false,
  error,
}: GeneralErrorProps) {
  const navigate = useNavigate()
  const { history } = useRouter()

  // Log the error for debugging
  useEffect(() => {
    if (error) {
      console.error('[GeneralError] Uncaught error:', error)
      console.error('[GeneralError] Stack trace:', error.stack)
    }
  }, [error])

  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        {!minimal && (
          <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        )}
        <span className='font-medium'>Oops! Something went wrong {`:')`}</span>
        <p className='text-muted-foreground text-center'>
          We apologize for the inconvenience. <br /> Please try again later.
        </p>
        {/* Show error details in development mode */}
        {import.meta.env.DEV && error && (
          <div className='mt-4 max-w-lg p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-left'>
            <p className='font-mono text-sm text-destructive font-semibold'>{error.name}: {error.message}</p>
            {error.stack && (
              <pre className='mt-2 text-xs text-muted-foreground overflow-auto max-h-40'>
                {error.stack}
              </pre>
            )}
          </div>
        )}
        {!minimal && (
          <div className='mt-6 flex gap-4'>
            <Button variant='outline' onClick={() => history.go(-1)}>
              Go Back
            </Button>
            <Button onClick={() => navigate({ to: '/' })}>Back to Home</Button>
          </div>
        )}
      </div>
    </div>
  )
}
