import * as React from 'react'

const FeedFavicon = React.forwardRef<HTMLImageElement>(
  (className, href, ...props) => {
    return (
      <img
        className={className}
        href={href}
        {...props}
      />
    )
  }
)
FeedFavicon.displayName = 'FeedFavicon'

export { FeedFavicon}
