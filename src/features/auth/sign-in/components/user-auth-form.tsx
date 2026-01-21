import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { HTMLAttributes, useState, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { cn } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { readSettingsFile, importSettings, getImportedLoginData, validateImportedSettings, type ExportedSettings } from '@/lib/settings-export'
import { IconUpload } from '@tabler/icons-react'
import { Capacitor } from '@capacitor/core'
import { FilePicker } from '@capawesome/capacitor-file-picker'

type UserAuthFormProps = Readonly<HTMLAttributes<HTMLFormElement>>

const formSchema = z.object({
  nextcloudUrl: z
    .string()
    .min(1, { message: 'Please enter your Nextcloud URL' })
    .url({ message: 'Please enter a valid URL' }),
  email: z
    .string()
    .min(1, { message: 'Please enter your username' }),
  password: z
    .string()
    .min(1, {
      message: 'Please enter your password',
    })
    .min(7, {
      message: 'Password must be at least 7 characters long',
    }),
})

export function UserAuthForm({ className, ...props }: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [importedSettings, setImportedSettings] = useState<ExportedSettings | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nextcloudUrl: '',
      email: '',
      password: '',
    },
  })

  const handleImportClick = async () => {
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

        // The file data is base64 encoded
        if (!file.data) {
          setAuthError('Could not read file data')
          return
        }

        // Decode base64 to string
        const content = atob(file.data)
        // eslint-disable-next-line no-console
        console.log('[Import] Decoded content length:', content.length)

        const data = JSON.parse(content)
        if (!validateImportedSettings(data)) {
          setAuthError('Invalid settings file format')
          return
        }

        // eslint-disable-next-line no-console
        console.log('[Import] Settings validated, keys:', Object.keys(data.settings).length)

        // Import settings (skip auth keys, we'll use them for the form)
        await importSettings(data, true)
        setImportedSettings(data)

        // Pre-fill the form with imported login data
        const loginData = getImportedLoginData(data)
        // eslint-disable-next-line no-console
        console.log('[Import] Login data:', { url: loginData.url, login: loginData.login })

        if (loginData.url) {
          form.setValue('nextcloudUrl', loginData.url)
        }
        if (loginData.login) {
          form.setValue('email', loginData.login)
        }

        setImportSuccess(true)
        setAuthError(null)
        // eslint-disable-next-line no-console
        console.log('[Import] Import completed successfully')
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Import] FilePicker error:', err)
        const errorMessage = err instanceof Error ? err.message : 'Failed to pick file'
        // Don't show error if user just cancelled
        if (!errorMessage.includes('cancel') && !errorMessage.includes('Cancel')) {
          setAuthError(`Import failed: ${errorMessage}`)
        }
      }
      return
    }

    // On web, use the file input
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // eslint-disable-next-line no-console
    console.log('[Import] handleFileChange triggered', e.target.files)

    const file = e.target.files?.[0]
    if (!file) {
      // eslint-disable-next-line no-console
      console.log('[Import] No file selected')
      setAuthError('No file selected. Please try again.')
      return
    }

    // eslint-disable-next-line no-console
    console.log('[Import] File selected:', file.name, 'size:', file.size, 'type:', file.type)

    try {
      const data = await readSettingsFile(file)
      // eslint-disable-next-line no-console
      console.log('[Import] Settings parsed successfully, keys:', Object.keys(data.settings).length)

      // Import settings (skip auth keys, we'll use them for the form)
      await importSettings(data, true)
      setImportedSettings(data)

      // Pre-fill the form with imported login data
      const loginData = getImportedLoginData(data)
      // eslint-disable-next-line no-console
      console.log('[Import] Login data extracted:', { url: loginData.url, login: loginData.login })

      if (loginData.url) {
        form.setValue('nextcloudUrl', loginData.url)
      }
      if (loginData.login) {
        form.setValue('email', loginData.login)
      }

      setImportSuccess(true)
      setAuthError(null)
      // eslint-disable-next-line no-console
      console.log('[Import] Import completed successfully')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Import] Failed to import settings:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to import settings'
      setAuthError(`Import failed: ${errorMessage}`)
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    setAuthError(null)
    
    try {
      // Test authentication with Nextcloud News API
      const response = await fetch(`${data.nextcloudUrl}/index.php/apps/news/api/v1-2/folders`, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(data.email + ':' + data.password),
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        // Authentication successful, store credentials in localStorage
        localStorage.setItem('backend-url', data.nextcloudUrl)
        localStorage.setItem('backend-login', data.email)
        localStorage.setItem('backend-password', data.password)
        localStorage.setItem('isAuthenticated', 'true')
        
        // eslint-disable-next-line no-console
        console.log('Authentication successful')
        
        // Redirect to dashboard or main page
        navigate({ to: '/' })
      } else if (response.status === 401) {
        setAuthError('Invalid credentials. Please check your username and password.')
      } else {
        setAuthError('Authentication failed. Please check your Nextcloud URL and try again.')
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Authentication error:', error)
      setAuthError('Connection failed. Please check your Nextcloud URL and internet connection.')
    } finally {
      setIsLoading(false)
    }
  }

  // Check if we have imported settings with pre-filled URL and login
  const hasImportedCredentials = !!(importedSettings &&
    getImportedLoginData(importedSettings).url &&
    getImportedLoginData(importedSettings).login)

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        {authError && (
          <Alert variant="destructive">
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}
        {importSuccess && (
          <Alert>
            <AlertDescription>
              Settings imported successfully. Please enter your password to continue.
            </AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name='nextcloudUrl'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nextcloud URL</FormLabel>
              <FormControl>
                <Input
                  placeholder='https://your-nextcloud.com'
                  {...field}
                  disabled={hasImportedCredentials}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input
                  placeholder='username'
                  {...field}
                  disabled={hasImportedCredentials}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem className='relative'>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} autoFocus={hasImportedCredentials} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          Login
        </Button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleImportClick}
          disabled={isLoading}
        >
          <IconUpload className="mr-2 h-4 w-4" />
          Import settings
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </form>
    </Form>
  )
}
