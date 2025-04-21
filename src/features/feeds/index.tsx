import { FeedFilter, FeedType } from '@/backends/types'

import FeedBackend from '@/backends/nextcloud-news/nextcloud-news'
/*i mport { Fragment } from 'react/jsx-runtime'
import { format } from 'date-fns'
import {
  IconArrowLeft,
  IconDotsVertical,
  IconMessages,
  IconPaperclip,
  IconPhone,
  IconPhotoPlus,
  IconPlus,
  IconSend,
  IconVideo,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'*/
import { Header } from '@/components/layout/header'
//import { type Convo } from './data/chat-types'
import { ItemsList } from './items-list'
import { ItemsListLoader } from '@/components/layout/loaders/itemslist-loader'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { Suspense } from 'react'
import { ThemeSwitch } from '@/components/theme-switch'
import { useParams } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

export default function Feeds() {
  const params = useParams({ strict: false });
  //const [search, setSearch] = useState('')

  //const [, setCreateConversationDialog] = useState(false)
  /*const conversations = []
  // Filtered data based on the search query
  const filteredItemList = conversations.filter(({ fullName }) =>
    fullName.toLowerCase().includes(search.trim().toLowerCase())
  )*/

  const getFeedItems = async () => {
    
    const backend = new FeedBackend();
    const filter: FeedFilter = {
      id : String(params.feedId) || String(params.folderId),
      type: params.feedId ? FeedType.FEED : FeedType.FOLDER,
      withUnreadItems: true,
    }
    
    return await backend.getFeedItems(filter);
  }

  const FilterItemList = () => {
    const { data } = useSuspenseQuery({
      queryKey: ['feeds'],
      queryFn: getFeedItems,
    });

    return <ItemsList items={data} />;
  };

  /*c onst currentMessage = selectedUser?.messages.reduce(
    (acc: Record<string, Convo[]>, obj) => {
      const key = format(obj.timestamp, 'd MMM, yyyy')

      // Create an array for the category if it doesn't exist
      if (!acc[key]) {
        acc[key] = []
      }

      // Push the current object to the array
      acc[key].push(obj)

      return acc
    },
    {}
  )*/

  //const users = conversations.map(({ messages, ...user }) => user)

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <Search />
        <div className='ml-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main fixed>
        <section className='flex h-full gap-6'>
          {/* Left Side */}
          <Suspense fallback={<ItemsListLoader />}>
            <FilterItemList />
          </Suspense>

          {/* Right Side */}
          {/*selectedUser ? (
            <div
              className={cn(
                'absolute inset-0 left-full z-50 hidden w-full flex-1 flex-col rounded-md border bg-primary-foreground shadow-sm transition-all duration-200 sm:static sm:z-auto sm:flex',
                mobileSelectedUser && 'left-0 flex'
              )}
            >
              {/ * Top Part * /}
              <div className='mb-1 flex flex-none justify-between rounded-t-md bg-secondary p-4 shadow-lg'>
                {/ * Left * /}
                <div className='flex gap-3'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='-ml-2 h-full sm:hidden'
                    onClick={() => setMobileSelectedUser(null)}
                  >
                    <IconArrowLeft />
                  </Button>
                  <div className='flex items-center gap-2 lg:gap-4'>
                    <Avatar className='size-9 lg:size-11'>
                      <AvatarImage
                        src={selectedUser.profile}
                        alt={selectedUser.username}
                      />
                      <AvatarFallback>{selectedUser.username}</AvatarFallback>
                    </Avatar>
                    <div>
                      <span className='col-start-2 row-span-2 text-sm font-medium lg:text-base'>
                        {selectedUser.fullName}
                      </span>
                      <span className='col-start-2 row-span-2 row-start-2 line-clamp-1 block max-w-32 text-ellipsis text-nowrap text-xs text-muted-foreground lg:max-w-none lg:text-sm'>
                        {selectedUser.title}
                      </span>
                    </div>
                  </div>
                </div>

                {/ * Right * /}
                <div className='-mr-1 flex items-center gap-1 lg:gap-2'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='hidden size-8 rounded-full sm:inline-flex lg:size-10'
                  >
                    <IconVideo size={22} className='stroke-muted-foreground' />
                  </Button>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='hidden size-8 rounded-full sm:inline-flex lg:size-10'
                  >
                    <IconPhone size={22} className='stroke-muted-foreground' />
                  </Button>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='h-10 rounded-md sm:h-8 sm:w-4 lg:h-10 lg:w-6'
                  >
                    <IconDotsVertical className='stroke-muted-foreground sm:size-5' />
                  </Button>
                </div>
              </div>

              {/ * Conversation * /}
              <div className='flex flex-1 flex-col gap-2 rounded-md px-4 pb-4 pt-0'>
                <div className='flex size-full flex-1'>
                  <div className='chat-text-container relative -mr-4 flex flex-1 flex-col overflow-y-hidden'>
                    <div className='chat-flex flex h-40 w-full flex-grow flex-col-reverse justify-start gap-4 overflow-y-auto py-2 pb-4 pr-4'>
                      { /* currentMessage &&
                        Object.keys(currentMessage).map((key) => (
                          <Fragment key={key}>
                            {currentMessage[key].map((msg, index) => (
                              <div
                                key={`${msg.sender}-${msg.timestamp}-${index}`}
                                className={cn(
                                  'chat-box max-w-72 break-words px-3 py-2 shadow-lg',
                                  msg.sender === 'You'
                                    ? 'self-end rounded-[16px_16px_0_16px] bg-primary/85 text-primary-foreground/75'
                                    : 'self-start rounded-[16px_16px_16px_0] bg-secondary'
                                )}
                              >
                                {msg.message}{' '}
                                <span
                                  className={cn(
                                    'mt-1 block text-xs font-light italic text-muted-foreground',
                                    msg.sender === 'You' && 'text-right'
                                  )}
                                >
                                  {format(msg.timestamp, 'h:mm a')}
                                </span>
                              </div>
                            ))}
                            <div className='text-center text-xs'>{key}</div>
                          </Fragment>
                        )) * /}
                    </div>
                  </div>
                </div>
                <form className='flex w-full flex-none gap-2'>
                  <div className='flex flex-1 items-center gap-2 rounded-md border border-input px-2 py-1 focus-within:outline-none focus-within:ring-1 focus-within:ring-ring lg:gap-4'>
                    <div className='space-x-1'>
                      <Button
                        size='icon'
                        type='button'
                        variant='ghost'
                        className='h-8 rounded-md'
                      >
                        <IconPlus
                          size={20}
                          className='stroke-muted-foreground'
                        />
                      </Button>
                      <Button
                        size='icon'
                        type='button'
                        variant='ghost'
                        className='hidden h-8 rounded-md lg:inline-flex'
                      >
                        <IconPhotoPlus
                          size={20}
                          className='stroke-muted-foreground'
                        />
                      </Button>
                      <Button
                        size='icon'
                        type='button'
                        variant='ghost'
                        className='hidden h-8 rounded-md lg:inline-flex'
                      >
                        <IconPaperclip
                          size={20}
                          className='stroke-muted-foreground'
                        />
                      </Button>
                    </div>
                    <label className='flex-1'>
                      <span className='sr-only'>Chat Text Box</span>
                      <input
                        type='text'
                        placeholder='Type your messages...'
                        className='h-8 w-full bg-inherit focus-visible:outline-none'
                      />
                    </label>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='hidden sm:inline-flex'
                    >
                      <IconSend size={20} />
                    </Button>
                  </div>
                  <Button className='h-full sm:hidden'>
                    <IconSend size={18} /> Send
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'absolute inset-0 left-full z-50 hidden w-full flex-1 flex-col justify-center rounded-md border bg-primary-foreground shadow-sm transition-all duration-200 sm:static sm:z-auto sm:flex'
              )}
            >
              <div className='flex flex-col items-center space-y-6'>
                <div className='flex h-16 w-16 items-center justify-center rounded-full border-2 border-white'>
                  <IconMessages className='h-8 w-8' />
                </div>
                <div className='space-y-2 text-center'>
                  <h1 className='text-xl font-semibold'>Your messages</h1>
                  <p className='text-sm text-gray-400'>
                    Send a message to start a chat.
                  </p>
                </div>
                <Button
                  className='bg-blue-500 px-6 text-white hover:bg-blue-600'
                  onClick={() => setCreateConversationDialog(true)}
                >
                  Send message
                </Button>
              </div>
            </div>
          )*/}
        </section>
      </Main>
    </>
  )
}
