import { FeedFilter, FeedType } from '@/backends/types'
import { IconListDetails, IconNews, IconStar } from '@tabler/icons-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

import { Button } from '../ui/button'
import { FoldersLoader } from './loaders/folders-loader'
import { FoldersNavGroup } from './folders-nav-group'
import { Suspense } from 'react'
import { useFeedQuery } from '@/context/feed-query-provider'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { feedQuery, setFeedQuery } = useFeedQuery()
  console.log('AppSidebar', feedQuery)


  const toggleFeedQueryButton = (feedFilter?: FeedFilter, feedType?: FeedType) => {
    let feedId = feedQuery.feedId;
    let folderId = feedQuery.folderId;
    let filter = feedFilter ?? feedQuery.feedFilter;
    const type = feedType ?? feedQuery.feedType;
    if (type == FeedType.STARRED) {
      filter = FeedFilter.ALL;
      feedId = undefined;
      folderId = undefined;
    }
    setFeedQuery({
      feedFilter: filter,
      feedType: type,
      feedId: feedId,
      folderId: folderId
    })
  }

  return (
    <Sidebar collapsible='icon' variant='floating' {...props}>
      <SidebarHeader>
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<FoldersLoader />}>
          <FoldersNavGroup />
        </Suspense>

        <SidebarGroup>
          <SidebarGroupLabel>Filters</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='Read + Unread'>
                <Button onClick={() => {
                  toggleFeedQueryButton(FeedFilter.ALL)
                }}
                  className='bg-transparent hover:bg-transparent justify-start text-secondary-foreground hover:text-blue-500'>
                  <IconNews className={feedQuery.feedType != FeedType.STARRED && feedQuery.feedFilter == FeedFilter.ALL ? 'text-blue-500' : ''} />
                  <span className={`text-xs ${feedQuery.feedType != FeedType.STARRED && feedQuery.feedFilter == FeedFilter.ALL ? 'font-bold text-blue-500' : null}`}>Read + Unread</span>
                </Button>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='Only unread'>
                <Button onClick={() => {
                  toggleFeedQueryButton(FeedFilter.UNREAD)
                }} className='bg-transparent hover:bg-transparent justify-start text-secondary-foreground hover:text-blue-500'>
                  <IconListDetails className={feedQuery.feedType != FeedType.STARRED && feedQuery.feedFilter == FeedFilter.UNREAD ? 'text-blue-500' : ''} />
                  <span className={`text-xs ${feedQuery.feedType != FeedType.STARRED && feedQuery.feedFilter == FeedFilter.UNREAD ? 'font-bold text-blue-500' : null}`}>Only unread</span>
                </Button>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='Starred'>
                <Button onClick={() => {
                  toggleFeedQueryButton(undefined, FeedType.STARRED)
                }} className='bg-transparent hover:bg-transparent justify-start text-secondary-foreground hover:text-blue-500'>
                  <IconStar className={feedQuery.feedType == FeedType.STARRED ? 'text-blue-500' : ''} />
                  <span className={`text-xs ${feedQuery.feedType == FeedType.STARRED ? 'font-bold text-blue-500' : null}`}>Starred</span>
                </Button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        
      </SidebarContent>
      <SidebarFooter>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar >
  )
}
