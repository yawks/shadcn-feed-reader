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
import { downloadSettings, readSettingsFile, importSettings, exportSettings, validateImportedSettings } from '@/lib/settings-export'
import { IconDownload, IconUpload } from '@tabler/icons-react'
import { Capacitor } from '@capacitor/core'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { Share } from '@capacitor/share'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

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
    // eslint-disable-next-line no-console
    console.log('[Export] Starting export')

    try {
      // On native platforms, use Capacitor Filesystem + Share
      if (Capacitor.isNativePlatform()) {
        // eslint-disable-next-line no-console
        console.log('[Export] Using Capacitor Filesystem + Share')

        const exported = exportSettings()
        const json = JSON.stringify(exported, null, 2)
        const filename = `feed-reader-settings-${new Date().toISOString().split('T')[0]}.json`

        // Write file to cache directory
        const result = await Filesystem.writeFile({
          path: filename,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })

        // eslint-disable-next-line no-console
        console.log('[Export] File written:', result.uri)

        // Share the file
        await Share.share({
          title: 'Export Feed Reader Settings',
          url: result.uri,
          dialogTitle: 'Save settings file',
        })

        // eslint-disable-next-line no-console
        console.log('[Export] Share dialog opened')
        return
      }

      // On web/Tauri, use existing method
      await downloadSettings()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Export] Failed to export settings:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to export settings'
      // Don't show error if user just cancelled the share dialog
      if (!errorMessage.includes('cancel') && !errorMessage.includes('Cancel')) {
        alert(errorMessage)
      }
    }
  }

  const handleImportClick = async () => {
    // eslint-disable-next-line no-console
    console.log('[Import] Starting import')

    // On native platforms, use Capacitor FilePicker
    if (Capacitor.isNativePlatform()) {
      // eslint-disable-next-line no-console
      console.log('[Import] Using Capacitor FilePicker')

      try {
        const result = await FilePicker.pickFiles({
          types: ['application/json'],
          readData: true,
        })

        // eslint-disable-next-line no-console
        console.log('[Import] FilePicker result:', result)

        if (result.files.length === 0) {
          // eslint-disable-next-line no-console
          console.log('[Import] No file selected')
          return
        }

        const file = result.files[0]
        // eslint-disable-next-line no-console
        console.log('[Import] File picked:', file.name, 'size:', file.size)

        if (!file.data) {
          alert('Could not read file data')
          return
        }

        // Decode base64 to string
        const content = atob(file.data)
        // eslint-disable-next-line no-console
        console.log('[Import] Decoded content length:', content.length)

        const data = JSON.parse(content)
        if (!validateImportedSettings(data)) {
          alert('Invalid settings file format')
          return
        }

        // eslint-disable-next-line no-console
        console.log('[Import] Settings validated, keys:', Object.keys(data.settings).length)

        await importSettings(data)
        // eslint-disable-next-line no-console
        console.log('[Import] Import completed, reloading...')

        // Reload the page to apply imported settings
        window.location.reload()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Import] FilePicker error:', err)
        const errorMessage = err instanceof Error ? err.message : 'Failed to pick file'
        // Don't show error if user just cancelled
        if (!errorMessage.includes('cancel') && !errorMessage.includes('Cancel')) {
          alert(`Import failed: ${errorMessage}`)
        }
      }
      return
    }

    // On web, use the file input
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // eslint-disable-next-line no-console
    console.log('[Import] handleFileChange triggered')

    const file = e.target.files?.[0]
    if (!file) return

    try {
      const data = await readSettingsFile(file)
      await importSettings(data)
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          Log out
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
