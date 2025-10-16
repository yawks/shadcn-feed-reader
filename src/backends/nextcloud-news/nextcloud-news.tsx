import { Backend, Feed, FeedFilter, FeedFolder, FeedItem, FeedQuery, FeedType } from '../types';
import { NNFeed, NNFeeds, NNFolder, NNFolders, NNItem, NNItems, NNSearchResult } from './nextcloud-news-types';

import { api } from '@/utils/request';

export default class FeedBackend implements Backend {
  async renameFolder(folderId: string, name: string): Promise<void> {
    try {
      const url = this.url + `/index.php/apps/news/api/v1-2/folders/${folderId}`;
      const baseOptions = this._getOptions('PUT');
      const options: RequestInit = {
        ...baseOptions,
        body: JSON.stringify({ name }),
        headers: new Headers(baseOptions.headers),
      };
      (options.headers as Headers).set('Content-Type', 'application/json');
      const res = await fetch(url, options);
      if (!res.ok) throw new Error('Erreur lors du renommage du dossier');
    } catch (error) {
      throw new Error('Erreur API renameFolder: ' + error);
    }
  }

  async renameFeed(feedId: string, feedTitle: string): Promise<void> {
    try {
      const url = this.url + `/index.php/apps/news/api/v1-2/feeds/${feedId}/rename`;
      const baseOptions = this._getOptions('PUT');
      const options: RequestInit = {
        ...baseOptions,
        body: JSON.stringify({ feedTitle }),
        headers: new Headers(baseOptions.headers),
      };
      (options.headers as Headers).set('Content-Type', 'application/json');
      const res = await fetch(url, options);
      if (!res.ok) throw new Error('Erreur lors du renommage du flux');
    } catch (error) {
      throw new Error('Erreur API renameFeed: ' + error);
    }
  }

  async deleteFeed(feedId: string): Promise<void> {
    const url = this.url + `/index.php/apps/news/api/v1-2/feeds/${feedId}`;
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(this.login + ':' + this.password),
        },
      });
      if (!response.ok) {
        throw new Error('Erreur API deleteFeed: ' + response.statusText);
      }
    } catch (error) {
      throw new Error('Erreur API deleteFeed: ' + error);
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    const url = this.url + `/index.php/apps/news/api/v1-2/folders/${folderId}`;
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(this.login + ':' + this.password),
        },
      });
      if (!response.ok) {
        throw new Error('Erreur API deleteFolder: ' + response.statusText);
      }
    } catch (error) {
      throw new Error('Erreur API deleteFolder: ' + error);
    }
  }
  url: string
  login: string
  password: string

  constructor() {
    this.url = localStorage.getItem('backend-url') ?? '';
    this.login = localStorage.getItem('backend-login') ?? '';
    this.password = localStorage.getItem('backend-password') ?? '';
  }

  async getFolders(): Promise<FeedFolder[]> {
    let feedFolders: FeedFolder[] = [];
    try {
      const foldersById: { [id: string]: FeedFolder } = {};
      const foldersQuery = await api.get<NNFolders>(this.url + '/index.php/apps/news/api/v1-2/folders', this._getOptions());
      foldersQuery.folders.forEach((folder: NNFolder) => {
        foldersById[folder['id']] = {
          id: String(folder.id),
          name: folder.name,
          unreadCount: 0,
          feeds: [],
        };
      });

      feedFolders = await this._addFeedsToFolders(foldersById)
    } catch (error) {
      throw new Error('Network response was not ok' + error)
    }

    return feedFolders;
  }

  private _getOptions(method: string = 'GET'): RequestInit {
    const headers = new Headers()
    headers.append(
      'Authorization',
      'Basic ' + btoa(this.login + ':' + this.password)
    )

    const requestOptions = {
      method: method,
      headers: headers,
    }
    return requestOptions
  }

  async _addFeedsToFolders(foldersById: { [id: string]: FeedFolder }): Promise<FeedFolder[]> {
    // Start from all known folders so that empty folders are preserved
    const feedsInFolders: { [folderId: string]: FeedFolder } = {};
    Object.keys(foldersById).forEach((fid) => {
      feedsInFolders[fid] = {
        id: foldersById[fid].id,
        name: foldersById[fid].name,
        unreadCount: foldersById[fid].unreadCount ?? 0,
        feeds: foldersById[fid].feeds ?? [],
      };
    });

    try {
      const feedsQuery = await api.get<NNFeeds>(this.url + '/index.php/apps/news/api/v1-2/feeds', this._getOptions());
      feedsQuery.feeds.forEach((feed: NNFeed) => {
        const folderId = String(feed.folderId);
        if (!(folderId in feedsInFolders)) {
          // If API returns a feed for an unknown folder, create an entry
          feedsInFolders[folderId] = {
            id: folderId,
            name: foldersById[folderId]?.name ?? 'Unknown',
            unreadCount: 0,
            feeds: [],
          };
        }

        const newFeed: Feed = {
          id: String(feed.id),
          title: feed.title,
          unreadCount: feed.unreadCount,
          faviconUrl: feed.faviconLink,
          folderId: folderId,
        };

        feedsInFolders[folderId].feeds.push(newFeed);
        feedsInFolders[folderId].unreadCount = (feedsInFolders[folderId].unreadCount || 0) + feed.unreadCount;
      });
    } catch (error) {
      throw new Error('Network response was not ok' + error)
    }

    // Return all folders, including those without feeds
    return Object.values(feedsInFolders);

  }

  private async _getFeedsMapping(): Promise<{ [feedId: number]: Feed }> {
    const feedsMapping: { [feedId: number]: Feed } = {};
    try {
      const feedsQuery = await api.get<NNFeeds>(this.url + '/index.php/apps/news/api/v1-2/feeds', this._getOptions());
      feedsQuery.feeds.forEach((feed: NNFeed) => {
        feedsMapping[feed.id] = {
          id: String(feed.id),
          title: feed.title,
          unreadCount: feed.unreadCount,
          faviconUrl: feed.faviconLink,
          folderId: String(feed.folderId),
        } as Feed;
      });
    } catch (error) {
      throw new Error('Network response was not ok' + error)
    }

    return feedsMapping;
  }

  async getFeedItems(query: FeedQuery, offset?: number): Promise<FeedItem[]> {
    let items: FeedItem[] = [];
    try {
      // Récupérer tous les feeds pour créer un mapping feedId -> Feed
      const feedsMapping = await this._getFeedsMapping();
      const nbFeeds = Object.keys(feedsMapping).length;
      const batchSize = nbFeeds > 0 ? 20 * nbFeeds : 20;

      const params: { [key: string]: string } = {
        batchSize: String(batchSize),
        id: String(query.feedId ?? query.folderId ?? '0'),
        type: getNextcloudFeedType(query),
        getRead: String(query.feedFilter != FeedFilter.UNREAD),
        oldestFirst: 'false',
      };
      if (offset && offset > 0) {
        params['offset'] = String(offset);
      }
      const itemsQuery = await api.get<NNItems>(this.url + '/index.php/apps/news/api/v1-3/items?' + new URLSearchParams(params).toString(), this._getOptions());
      items = itemsQuery.items.map((item: NNItem) => {
        return {
          id: item.id,
          feed: feedsMapping[item.feedId] || null,
          title: item.title,
          url: item.url,
          pubDate: new Date(item.pubDate * 1000),
          read: !item.unread,
          starred: item.starred,
          body: item.body,
          thumbnailUrl: getItemImageURL(item),
        } as FeedItem
      });
    } catch (error) {
      throw new Error('Network response was not ok' + error)
    }

    return items;
  }

  async setFeedArticleRead(id: string): Promise<void> {
    try {
      await fetch(this.url + '/index.php/apps/news/api/v1-2/items/' + id + '/read', this._getOptions('PUT'));
    } catch (error) {
      throw new Error('Network response was not ok' + error)
    }
  }

  async searchItems(content: string): Promise<FeedItem[]> {
    let items: FeedItem[] = [];
    try {
      // Get all feeds for creating a mapping feedId -> Feed
      const feedsMapping = await this._getFeedsMapping();

      const params: { [key: string]: string } = {
        content: content,
        includeBody: 'true'
      };

      const searchQuery = await api.get<NNSearchResult>(
        this.url + '/index.php/apps/news/api/v1-3/search?' + new URLSearchParams(params).toString(),
        this._getOptions()
      );

      items = searchQuery.items.map((item: NNItem) => {
        return {
          id: item.id,
          feed: feedsMapping[item.feedId] || null,
          title: item.title,
          url: item.url,
          pubDate: new Date(item.pubDate * 1000),
          read: !item.unread,
          starred: item.starred,
          body: item.body,
          thumbnailUrl: getItemImageURL(item),
        } as FeedItem
      });
    } catch (error) {
      throw new Error('Network response was not ok' + error)
    }

    return items;
  }

}

function getItemImageURL(item: NNItem): string {
  const REX = /<img[^>]+src="([^">]+)"/g;
  let image = item.enclosureLink ?? "";
  if (image == "" || image == null) {
    image = item.mediaThumbnail ?? "";
    if ((image == "" || image == null) && item.body != null) {
      const m = REX.exec(item.body);
      if (m) {
        // Decode HTML entities in the image URL
        const txt = document.createElement('textarea');
        txt.innerHTML = m[1];
        image = txt.value;
      }
    }
  }

  return image;
}

function getNextcloudFeedType(query: FeedQuery): string {
  let nextCloudFeedType: string = '0';
  if (!query.feedId) {
    if (query.feedType == FeedType.STARRED) {
      nextCloudFeedType = '2';
    } else if (query.feedType == FeedType.FOLDER) {
      nextCloudFeedType = '1';
    } else if (query.feedFilter == FeedFilter.ALL || query.feedFilter == FeedFilter.UNREAD) {
      nextCloudFeedType = '3';
    }
  }

  return nextCloudFeedType
}