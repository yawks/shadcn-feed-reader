import { FeedFavicon } from '@/components/ui/feed-favicon'
import {
  IconFolder,
} from '@tabler/icons-react'

type Folder = {
  feeds: Folder[]
  id: number
  name: string
  opened: boolean
}

export default class FeedBackend {
  url: string
  login: string
  password: string

  constructor(url: string, login: string, password: string) {
    this.url = url
    this.login = login
    this.password = password
  }

  getFolders(filter: string): Promise<Folder[]> {
    return new Promise((resolve) => {
      fetch(this.url + '/index.php/apps/news/api/v1-2/folders', this._getOptions())
        .then((response) => {
          if (!response.ok) {
            throw new Error('Network response was not ok')
          }
          return response.json()
        })
        .then((data) => {
          resolve(this._getFeeds(data['folders'], filter))
        })
    })
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

  _getFeeds(folders: any, filter: string): Promise<any> {
    //filter cannot be used in the nextcloud news API
    return new Promise((resolve) => {
      fetch(this.url + '/index.php/apps/news/api/v1-2/feeds', this._getOptions())
        .then((response) => {
          if (!response.ok) {
            throw new Error('Network response was not ok')
          }
          return response.json()
        })
        .then((data) => {
          const feedsInFolders: any = {};
          for (const i in data['feeds']) {
            const feed = data['feeds'][i];
            if (!(feed['folderId'] in feedsInFolders)) {
              feedsInFolders[feed['folderId']] = {
                title: _getFolderName(feed['folderId'], folders),
                icon: IconFolder,
                badge: 0,
                url : '/folder/' + feed['folderId'],
                items : [],
              }
            }

            const newFeed = {
              //id: feed['id'],
              //url: feed['url'],
              title: feed['title'],
              badge: feed['unreadCount'],
              url: '/item/' + feed['id'],
              //feedUrl: feed['link'],
              icon: feed['faviconLink'] //+''/' //<FeedFavicon href={feed['faviconLink']} />,
               //<img src={feed['faviconLink']} />,
            };
            feedsInFolders[feed['folderId']]['items'].push(newFeed);
            feedsInFolders[feed['folderId']]['badge'] += feed['unreadCount'];
          }
          resolve(feedsInFolders)
        })
    })
  }

  getFeedItems(folderId: number): Promise<any> {
    /*
    var feedsUrl =
    getSettings().nextcloudurl + '/index.php/apps/news/api/v1-2/items';
  $.ajax({
    url: feedsUrl,
    data: {
      batchSize: NB_ITEMS_TO_LOAD,
      offset: offset,
      id: id,
      type: type == null && id != 0 ? 1 : type,
      getRead: withUnreadItems,
    },
    headers: {
      Authorization:
        'Basic ' +
        btoa(
          getSettings().nextclouduser + ':' + getSettings().nextcloudpassword
        ),
    }*/
   /*
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
        id: id,
        type: type == null && id != 0 ? 1 : type,
        getRead: withUnreadItems,
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
          resolve(data['folders'])
        })
    })
        */
  }
}

function _getFolderName(folderId: number, folders: any): string {
  for (const i in folders) {
    if (folders[i]['id'] == folderId) {
      return folders[i]['name']
    }
  }
  return ''
}