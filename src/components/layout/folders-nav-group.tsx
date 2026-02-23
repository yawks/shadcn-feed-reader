"use client"

import { IconFolder, IconNews } from "@tabler/icons-react";

import FeedBackend from "@/backends/nextcloud-news/nextcloud-news";
import { FeedFolder } from "@/backends/types";
import { NavGroup } from "./nav-group";
import { NavItem } from "./types";
import { useSuspenseQuery } from "@tanstack/react-query";

const getFolders = async () => {
    const backend = new FeedBackend();
    const folders: FeedFolder[] = await backend.getFolders();
    // Separate any 'Unknown' folder (feeds without a folder) so we can render their feeds
    // at the same level as folders (below the folders) instead of a dedicated 'Unknown' folder.
    const unknownFolder = folders.find((f) => f.name === 'Unknown')
    const realFolders = folders.filter((f) => f !== unknownFolder)

    const navItems: NavItem[] = realFolders.map((folder): NavItem => {
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
                feedUrl: feed.feedUrl,
            }))
        };
    })

    // Add a top-level 'All Articles' item
    const navItem: NavItem = {
        title: 'All Articles',
        url: '/',
        icon: IconNews,
    }
    navItems.unshift(navItem)

    // If there was an 'Unknown' folder, append its feeds as top-level items below folders
    if (unknownFolder && Array.isArray(unknownFolder.feeds)) {
        const orphanFeedItems: NavItem[] = unknownFolder.feeds.map((feed) => {
            const f = feed as unknown as { id: string; title: string; faviconUrl?: string; unreadCount?: number }
            return {
            title: f.title,
            url: `/feed/${f.id}`,
            iconUrl: f.faviconUrl,
            badge: f.unreadCount && f.unreadCount > 0 ? String(f.unreadCount) : undefined,
            feedUrl: feed.feedUrl,
        }})
        navItems.push(...orphanFeedItems)
    }

    return navItems
}

export const FoldersNavGroup = () => {
    const { data } = useSuspenseQuery({
        queryKey: ['folders'],
        queryFn: getFolders,
    });

    return <NavGroup key="folders" title="Folders" items={data} />;
};