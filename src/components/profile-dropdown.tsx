import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/utils/auth'
import { useNavigate } from '@tanstack/react-router'

export function ProfileDropdown() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const handleLogout = () => {
    // Use the centralized signOut function
    signOut()

    // Redirect to sign-in page
    navigate({ to: '/sign-in' })
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
          <Avatar className='h-8 w-8'>
            <AvatarImage src='/avatars/01.png' alt='@shadcn' />
            <AvatarFallback>{localStorage.getItem('backend-login')?.[0].toLocaleUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end' forceMount>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex flex-col space-y-1'>
            <p className='text-sm leading-none font-medium'>{localStorage.getItem('backend-login')}</p>
          </div>
        </DropdownMenuLabel>
        {/*<DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to='/settings'>
              Profile
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/settings'>
              Billing
              <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/settings'>
              Settings
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>New Team</DropdownMenuItem>
        </DropdownMenuGroup>*/}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          Log out
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
