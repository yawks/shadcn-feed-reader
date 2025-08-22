import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { HTMLAttributes, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { cn } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

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
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nextcloudUrl: '',
      email: '',
      password: '',
    },
  })

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
        <FormField
          control={form.control}
          name='nextcloudUrl'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nextcloud URL</FormLabel>
              <FormControl>
                <Input placeholder='https://your-nextcloud.com' {...field} />
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
                <Input placeholder='username' {...field} />
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
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          Login
        </Button>

      </form>
    </Form>
  )
}
