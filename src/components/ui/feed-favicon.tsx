import * as React from 'react'

interface FeedFaviconProps extends React.ImgHTMLAttributes<HTMLImageElement> {}

const FeedFavicon = React.forwardRef<HTMLImageElement, FeedFaviconProps>(
  ({ className, ...props }, ref) => {
    return (
      <img
        ref={ref}
        className={className}
        {...props}
      />
    )
  }
)
FeedFavicon.displayName = 'FeedFavicon'

export { FeedFavicon}
