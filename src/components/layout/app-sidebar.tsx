import { IconFolder, IconListDetails, IconNews, IconStar } from '@tabler/icons-react'
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
import { Suspense, useState } from 'react'

import FeedBackend from '@/backends/nextcloud-news/nextcloud-news'
import { FeedFolder } from '@/backends/types'
import { FoldersLoader } from './loaders/folders-loader'
import { Link } from '@tanstack/react-router'
import { NavGroup } from '@/components/layout/nav-group'
import { NavItem } from './types'
import { useSuspenseQuery } from '@tanstack/react-query'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [showOnlyUnread, setShowOnlyUnread] = useState(false)
  const [showOnlyStarred, setShowOnlyStarred] = useState(false)

  const getFolders = async () => {
    const backend = new FeedBackend();
    const folders: FeedFolder[] = await backend.getFolders();
    const navItems: NavItem[] = folders.map((folder) => {
      return {
        title: folder.name,
        url: `/${showOnlyUnread ? 'unread' : 'all'}/${showOnlyStarred ? 'starred' : 'all'}/folder/${folder.id}`,
        icon: IconFolder,
        badge: folder.unreadCount > 0 ? String(folder.unreadCount) : undefined,
        items: folder.feeds.map((feed) => {
          return {
            title: feed.title,
            url: `/${showOnlyUnread ? 'unread' : 'all'}/${showOnlyStarred ? 'starred' : 'all'}/feed/${feed.id}`,
            iconUrl: feed.faviconUrl,
            badge: feed.unreadCount > 0 ? String(feed.unreadCount) : undefined,
          }
        })
      }
    })

    return navItems
  }

  const FoldersNavGroup = () => {
    const { data } = useSuspenseQuery({
      queryKey: ['folders'],
      queryFn: getFolders,
    });

    return <NavGroup key="folders" title="Folders" items={data} />;
  };

  return (
    <Sidebar collapsible='icon' variant='floating' {...props}>
      <SidebarHeader>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>General</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='All'>
                <Link to={`/all/${showOnlyStarred ? 'starred' : 'all'}`} onClick={() => setShowOnlyUnread(false)} >
                  <IconNews className={!showOnlyUnread ? 'text-blue-500' : ''} />
                  <span className={`text-xs ${!showOnlyUnread ? 'font-bold text-blue-500' : null}`}>All</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='Only unread'>
                <Link to={`/unread/${showOnlyStarred ? 'starred' : 'all'}`} onClick={() => setShowOnlyUnread(true)} >
                  <IconListDetails className={showOnlyUnread ? 'text-blue-500' : ''} />
                  <span className={`text-xs ${showOnlyUnread ? 'font-bold text-blue-500' : null}`}>Only unread</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='Starred'>
                <Link to={`/${showOnlyUnread ? 'unread' : 'all'}/${!showOnlyStarred ? 'starred' : 'all'}`} onClick={() => setShowOnlyStarred(!showOnlyStarred)}>
                  <IconStar className={showOnlyStarred ? 'text-blue-500' : ''}/>
                  <span className={`text-xs ${showOnlyStarred ? 'font-bold text-blue-500' : null}`}>Starred</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <Suspense fallback={<FoldersLoader />}>
          <FoldersNavGroup />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
