"use client"

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
} from '@/components/ui/sidebar'

import { Button } from '../ui/button'
import { FoldersLoader } from './loaders/folders-loader'
import { FoldersNavGroup } from './folders-nav-group'
import { Suspense } from 'react'
import { useFeedQuery } from '@/hooks/use-feed-query'
import { useNavigate } from '@tanstack/react-router'
import { useSearch } from '@/context/search-context'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { feedQuery, setFeedQuery } = useFeedQuery()
  const navigate = useNavigate()
  const { isSearchMode } = useSearch()

  const toggleFeedQueryButton = (feedFilter?: FeedFilter, feedType?: FeedType) => {
    // do not allow changing filters in search mode
    if (isSearchMode) return;
    
    let feedId = feedQuery.feedId;
    let folderId = feedQuery.folderId;
    let filter = feedFilter ?? feedQuery.feedFilter;
    let type = feedType ?? feedQuery.feedType;
    
    if (feedType == FeedType.STARRED) {
      // for starred articles, we force the filter to ALL and remove the feed/folder constraints
      filter = FeedFilter.ALL;
      feedId = undefined;
      folderId = undefined;
    } else if (feedFilter !== undefined && feedType === undefined && feedQuery.feedType === FeedType.STARRED) {
      // if we are changing the filter from ALL to UNREAD (or vice versa)
      // and we were in STARRED mode, we reset the type to exit STARRED mode
      type = undefined;
    }
    
    setFeedQuery({
      feedFilter: filter,
      feedType: type,
      feedId: feedId,
      folderId: folderId
    })

    // Then navigate if necessary for starred
    if (feedType == FeedType.STARRED) {
      navigate({ to: '/' });
    }
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
                tooltip={isSearchMode ? 'Filtering disabled during search' : 'Read + Unread'}>
                <Button 
                  onClick={() => {
                    toggleFeedQueryButton(FeedFilter.ALL)
                  }}
                  disabled={isSearchMode}
                  className={`bg-transparent hover:bg-transparent justify-start text-secondary-foreground ${isSearchMode ? 'opacity-50 cursor-not-allowed hover:text-secondary-foreground' : 'hover:text-blue-500'}`}>
                  <IconNews className={!isSearchMode && feedQuery.feedType != FeedType.STARRED && feedQuery.feedFilter == FeedFilter.ALL ? 'text-blue-500' : ''} />
                  <span className={`text-xs ${!isSearchMode && feedQuery.feedType != FeedType.STARRED && feedQuery.feedFilter == FeedFilter.ALL ? 'font-bold text-blue-500' : null}`}>Read + Unread</span>
                </Button>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={isSearchMode ? 'Filtering disabled during search' : 'Only unread'}>
                <Button 
                  onClick={() => {
                    toggleFeedQueryButton(FeedFilter.UNREAD)
                  }} 
                  disabled={isSearchMode}
                  className={`bg-transparent hover:bg-transparent justify-start text-secondary-foreground ${isSearchMode ? 'opacity-50 cursor-not-allowed hover:text-secondary-foreground' : 'hover:text-blue-500'}`}>
                  <IconListDetails className={!isSearchMode && feedQuery.feedType != FeedType.STARRED && feedQuery.feedFilter == FeedFilter.UNREAD ? 'text-blue-500' : ''} />
                  <span className={`text-xs ${!isSearchMode && feedQuery.feedType != FeedType.STARRED && feedQuery.feedFilter == FeedFilter.UNREAD ? 'font-bold text-blue-500' : null}`}>Only unread</span>
                </Button>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={isSearchMode ? 'Filtering disabled during search' : 'Starred'}>
                <Button 
                  onClick={() => {
                    toggleFeedQueryButton(undefined, FeedType.STARRED)
                  }} 
                  disabled={isSearchMode}
                  className={`bg-transparent hover:bg-transparent justify-start text-secondary-foreground ${isSearchMode ? 'opacity-50 cursor-not-allowed hover:text-secondary-foreground' : 'hover:text-blue-500'}`}>
                  <IconStar className={!isSearchMode && feedQuery.feedType == FeedType.STARRED ? 'text-blue-500' : ''} />
                  <span className={`text-xs ${!isSearchMode && feedQuery.feedType == FeedType.STARRED ? 'font-bold text-blue-500' : null}`}>Starred</span>
                </Button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        
      </SidebarContent>
      <SidebarFooter>
      </SidebarFooter>
    </Sidebar >
  )
}
