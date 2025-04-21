import { Backend, Feed, FeedFilter, FeedFolder, FeedItem, FeedType } from '../types';
import { NNFeed, NNFeeds, NNFolder, NNFolders, NNItem, NNItems } from './nextcloud-news-types';

import { api } from '@/utils/request';

const NB_ITEMS_TO_LOAD = 20;


export default class FeedBackend implements Backend {
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

  private _getOptions() {
    const headers = new Headers()
    headers.append(
      'Authorization',
      'Basic ' + btoa(this.login + ':' + this.password)
    )

    const requestOptions = {
      method: 'GET',
      headers: headers,
    }
    return requestOptions
  }

  async _addFeedsToFolders(foldersById: { [id: string]: FeedFolder }): Promise<FeedFolder[]> {
    const feedsInFolders: { [folderId: string]: FeedFolder } = {};
    try {
      const feedsQuery = await api.get<NNFeeds>(this.url + '/index.php/apps/news/api/v1-2/feeds', this._getOptions());
      feedsQuery.feeds.forEach((feed: NNFeed) => {
        if (!(feed.folderId in feedsInFolders)) {
          feedsInFolders[feed.folderId] = {
            id: String(feed.folderId),
            name: foldersById[feed.folderId].name,
            unreadCount: 0,
            feeds: [],
          }
        }

        const newFeed = {
          id: String(feed.id),
          title: feed.title,
          unreadCount: feed.unreadCount,
          faviconUrl: feed.faviconLink,
        } as Feed;
        feedsInFolders[feed.folderId].feeds.push(newFeed);
        feedsInFolders[feed.folderId].unreadCount += feed.unreadCount;
      });
    }
    catch (error) {
      throw new Error('Network response was not ok' + error)
    }

    return Object.values(feedsInFolders);

  }

  async getFeedItems(filter: FeedFilter, offset: number = 0): Promise<FeedItem[]> {
    let items: FeedItem[] = [];

    try {
      const itemsQuery = await api.get<NNItems>(this.url + '/index.php/apps/news/api/v1-2/items?' + new URLSearchParams({
        batchSize: String(NB_ITEMS_TO_LOAD),
        offset: String(offset),
        id: filter.id,
        type: getFeedType(filter.type),
        getRead: String(filter.withUnreadItems)
      }).toString(), this._getOptions());
      items = itemsQuery.items.map((item: NNItem) => {
        return {
          id: String(item.id),
          feed: null, //String(item.feedId), TODO get the feed object
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
        image = m[1];
      }
    }
  }

  return image;
}

function getFeedType(type: FeedType): string {
  switch (type) {
    case FeedType.STARRED:
      return '2';
    case FeedType.FOLDER:
      return '1';
    default:
      return '0';
  }
}