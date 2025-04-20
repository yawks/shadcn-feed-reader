import { Feed, FeedFilter, FeedFolder, FeedItem, FeedType } from '../types';
import { NNFeed, NNFeeds, NNFolder, NNFolders, NNItem } from './nextcloud-news-types';

import { api } from '@/utils/request';

const NB_ITEMS_TO_LOAD = 20;


export default class FeedBackend { //} implements Backend {
  url: string
  login: string
  password: string

  constructor(url: string, login: string, password: string) {
    this.url = url
    this.login = login
    this.password = password
  }

  async getFolders(): Promise<FeedFolder[]> {
    let feedFolders: FeedFolder[] = [];
    try {
      const foldersById: { [id: string]: FeedFolder } = {};
      const foldersQuery = await api.get<NNFolders>(this.url + '/index.php/apps/news/api/v1-2/folders', this._getOptions());
      //const foldersQuery = await api.get<NNFolders>('https://yawks.net/html/test.php');
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
            id: String(feed.id),
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

  getFeedItems(filter: FeedFilter, offset: number = 0): Promise<FeedItem[]> {
    const headers = new Headers()
    headers.append(
      'Authorization',
      'Basic ' + btoa(this.login + ':' + this.password)
    )

    const requestOptions = {
      method: 'GET',
      headers: headers,
      data: {
        batchSize: NB_ITEMS_TO_LOAD,
        offset: offset,
        id: filter.folderId,
        type: filter.type == FeedType.STARRED ? 2 : 3,
        getRead: filter.withUnreadItems,
      },
    }
    return new Promise((resolve) => {
      fetch(this.url + '/index.php/apps/news/api/v1-2/items', requestOptions)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Network response was not ok')
          }
          return response.json()
        })
        .then((data) => {
          resolve(data['items'].map((item: NNItem) => {
            return {
              id: String(item.id),
              feedId: String(item.feedId),
              folderId: filter.folderId,
              title: item.title,
              url: item.url,
              pubDate: new Date(item.pubDate),
              read: !item.unread,
              starred: item.starred,
              body: item.body,
              thumbnailUrl: item.enclosureLink,
            } as FeedItem
          }
          ))
        })
    })
  }
}
