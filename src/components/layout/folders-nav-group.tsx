import { IconFolder, IconNews } from "@tabler/icons-react";

import FeedBackend from "@/backends/nextcloud-news/nextcloud-news";
import { FeedFolder } from "@/backends/types";
import { NavGroup } from "./nav-group";
import { NavItem } from "./types";
import { useSuspenseQuery } from "@tanstack/react-query";

const getFolders = async () => {
    const backend = new FeedBackend();
    const folders: FeedFolder[] = await backend.getFolders();
    const navItems: NavItem[] = folders.map((folder) => {
        return {
            title: folder.name,
            url: `/folder/${folder.id}`,
            icon: IconFolder,
            badge: folder.unreadCount > 0 ? String(folder.unreadCount) : undefined,
            items: folder.feeds.map((feed) => {
                return {
                    title: feed.title,
                    url: `/feed/${feed.id}`,
                    iconUrl: feed.faviconUrl,
                    badge: feed.unreadCount > 0 ? String(feed.unreadCount) : undefined,
                }
            })
        }
    })

    navItems.unshift({
        title: 'All Articles',
        url: '/',
        icon: IconNews
    })

    return navItems
}

export const FoldersNavGroup = () => {
    const { data } = useSuspenseQuery({
        queryKey: ['folders'],
        queryFn: getFolders,
    });

    return <NavGroup key="folders" title="Folders" items={data} />;
};