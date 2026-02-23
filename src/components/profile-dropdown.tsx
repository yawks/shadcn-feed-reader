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
import { useRef } from 'react'
import { downloadSettings, readSettingsFile, importSettings } from '@/lib/settings-export'
import { IconDownload, IconUpload } from '@tabler/icons-react'

export function ProfileDropdown() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLogout = () => {
    // Use the centralized signOut function
    signOut()

    // Redirect to sign-in page
    navigate({ to: '/sign-in' })
  }

  const handleExport = async () => {
    try {
      await downloadSettings()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Export] Failed to export settings:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to export settings'
      alert(errorMessage)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const data = await readSettingsFile(file)
      importSettings(data)
      // Reload the page to apply imported settings
      window.location.reload()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to import settings:', err)
      alert(err instanceof Error ? err.message : 'Failed to import settings')
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <>
      {/* Hidden file input - placed outside dropdown to persist after dropdown closes */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
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
          <DropdownMenuItem onClick={handleExport}>
            <IconDownload className="mr-2 h-4 w-4" />
            Export settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleImportClick}>
            <IconUpload className="mr-2 h-4 w-4" />
            Import settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            Log out
            <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
