import {
  IconBarrierBlock,
  IconBrowserCheck,
  IconBug,
  IconError404,
  IconHelp,
  IconLock,
  IconLockAccess,
  IconNotification,
  IconPalette,
  IconServerOff,
  IconSettings,
  IconTool,
  IconUserCog,
  IconUserOff,
  IconNews,
  IconListDetails,
  IconFolder,
} from '@tabler/icons-react'
import { AudioWaveform, Command, GalleryVerticalEnd } from 'lucide-react'
import FeedBackend from '../../../backends/nextcloud-news/nextcloud-news'
import { type SidebarData, type NavItem } from '../types'
import { FeedFolder } from '@/backends/types'

const FOLDER_ITEMS: NavItem[] = []

export const sidebarData: SidebarData = {
  setFeedFilter: (filter: string) => {
   //TODO handle filters
  },
  user: {
    name: 'satnaing',
    email: 'satnaingdev@gmail.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Shadcn Admin',
      logo: Command,
      plan: 'Vite + ShadcnUI',
    },
    {
      name: 'Acme Inc',
      logo: GalleryVerticalEnd,
      plan: 'Enterprise',
    },
    {
      name: 'Acme Corp.',
      logo: AudioWaveform,
      plan: 'Startup',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'All items',
          url: '/all',
          icon: IconNews,
        },
        {
          title: 'Unread items',
          url: '/unread',
          icon: IconListDetails,
        },
        /*
        {
          title: 'Dashboard',
          url: '/',
          icon: IconLayoutDashboard,
        },
        {
          title: 'Tasks',
          url: '/tasks',
          icon: IconChecklist,
        },
        {
          title: 'Apps',
          url: '/apps',
          icon: IconPackages,
        },
        {
          title: 'Chats',
          url: '/chats',
          badge: '3',
          icon: IconMessages,
        },
        {
          title: 'Users',
          url: '/users',
          icon: IconUsers,
        },*/
      ],
    },
    {
      title: 'Folders',
      items: FOLDER_ITEMS,
    },
    {
      title: 'Pages',
      items: [
        {
          title: 'Auth',
          icon: IconLockAccess,
          items: [
            {
              title: 'Sign In',
              url: '/sign-in',
            },
            {
              title: 'Sign In (2 Col)',
              url: '/sign-in-2',
            },
            {
              title: 'Sign Up',
              url: '/sign-up',
            },
            {
              title: 'Forgot Password',
              url: '/forgot-password',
            },
            {
              title: 'OTP',
              url: '/otp',
            },
          ],
        },
        {
          title: 'Errors',
          icon: IconBug,
          items: [
            {
              title: 'Unauthorized',
              url: '/401',
              icon: IconLock,
            },
            {
              title: 'Forbidden',
              url: '/403',
              icon: IconUserOff,
            },
            {
              title: 'Not Found',
              url: '/404',
              icon: IconError404,
            },
            {
              title: 'Internal Server Error',
              url: '/500',
              icon: IconServerOff,
            },
            {
              title: 'Maintenance Error',
              url: '/503',
              icon: IconBarrierBlock,
            },
          ],
        },
      ],
    },
    {
      title: 'Other',
      items: [
        {
          title: 'Settings',
          icon: IconSettings,
          items: [
            {
              title: 'Profile',
              url: '/settings',
              icon: IconUserCog,
            },
            {
              title: 'Account',
              url: '/settings/account',
              icon: IconTool,
            },
            {
              title: 'Appearance',
              url: '/settings/appearance',
              icon: IconPalette,
            },
            {
              title: 'Notifications',
              url: '/settings/notifications',
              icon: IconNotification,
            },
            {
              title: 'Display',
              url: '/settings/display',
              icon: IconBrowserCheck,
            },
          ],
        },
        {
          title: 'Help Center',
          url: '/help-center',
          icon: IconHelp,
        },
      ],
    },
  ],
}

new FeedBackend(
  'https://nextcloud.yawks.net',
  'mat',
  'MZM6d-ZqeZa-xkQ6Y-cQRzd-KWcok'
)
  .getFolders()
  .then((folders : FeedFolder[]) => {
    folders.forEach((folder) => {
      //FOLDER_ITEMS.push(folders[folderId])
      const items: NavItem[] = [];
      folder.feeds.forEach((feed) => {
        items.push({
          title: feed.title,
          url: '/feed/' + feed.id,
          icon: feed.faviconUrl,
          badge: feed.unreadCount > 0 ? String(feed.unreadCount) : undefined,
        })
      })
      FOLDER_ITEMS.push({
        title: folder.name,
        url: '/folder/' + folder.id,
        icon: IconFolder,
        items: items,
        badge: folder.unreadCount > 0 ? String(folder.unreadCount) : undefined,
      })
    })
  })
