import { IconFolder, IconListDetails, IconNews } from '@tabler/icons-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

import FeedBackend from '@/backends/nextcloud-news/nextcloud-news'
import { FeedFolder } from '@/backends/types'
import { FoldersLoader } from './loaders/folders-loader'
import { NavGroup } from '@/components/layout/nav-group'
import { NavItem } from './types'
import { Suspense } from 'react'
//import { sidebarData } from './data/sidebar-data'
//import { useParams } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  //const params = useParams({ strict: false });
  //sidebarData.setFeedFilter(params.filter);


  const generalItems: NavItem[] = [{
    title: 'All items',
    url: '/all',
    icon: IconNews
  },
  {
    title: 'Unread items',
    url: '/unread',
    icon: IconListDetails,
  }];

  const getFolders = async () => {
    const backend = new FeedBackend();
    const folders: FeedFolder[] = await backend.getFolders();
    const navItems: NavItem[] = folders.map((folder) => {
      return {
        title: folder.name,
        url: '/folder/' + folder.id,
        icon: IconFolder,
        badge: folder.unreadCount > 0 ? String(folder.unreadCount) : undefined,
        items: folder.feeds.map((feed) => {
          return {
            title: feed.title,
            url: '/feed/' + feed.id,
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
        <NavGroup key='general' title='General' items={generalItems} />
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
