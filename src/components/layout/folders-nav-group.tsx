import { IconFolder, IconNews } from "@tabler/icons-react";

import FeedBackend from "@/backends/nextcloud-news/nextcloud-news";
import { FeedFolder } from "@/backends/types";
import { NavGroup } from "./nav-group";
import { NavItem } from "./types";
import { useSuspenseQuery } from "@tanstack/react-query";

const getFolders = async () => {
    const backend = new FeedBackend();
    const folders: FeedFolder[] = await backend.getFolders();
    const navItems: NavItem[] = folders.map((folder): NavItem => {
        return {
            title: folder.name,
            icon: IconFolder,
            badge: folder.unreadCount > 0 ? String(folder.unreadCount) : undefined,
            url : `/folder/${folder.id}`,
            // @ts-expect-error - Dynamic route parameters are not handled well by the strict router typing
            items: folder.feeds.map((feed) => ({
                title: feed.title,
                url: `/feed/${feed.id}`,
                iconUrl: feed.faviconUrl,
                badge: feed.unreadCount > 0 ? String(feed.unreadCount) : undefined,
            }))
        };
    })

    const navItem: NavItem = {
        title: 'All Articles',
        url: '/',
        icon: IconNews,
    }
    navItems.unshift(navItem)

    return navItems
}

export const FoldersNavGroup = () => {
    const { data } = useSuspenseQuery({
        queryKey: ['folders'],
        queryFn: getFolders,
    });

    return <NavGroup key="folders" title="Folders" items={data} />;
};