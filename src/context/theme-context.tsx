import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  effectiveTheme: 'dark' | 'light'
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  effectiveTheme: 'light',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, _setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )
  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const storedTheme = (localStorage.getItem(storageKey) as Theme) || defaultTheme
    if (storedTheme === 'system') {
      return mediaQuery.matches ? 'dark' : 'light'
    }
    return storedTheme as 'dark' | 'light'
  })

  useEffect(() => {
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = (theme: Theme) => {
      root.classList.remove('light', 'dark') // Remove existing theme classes
      const systemTheme = mediaQuery.matches ? 'dark' : 'light'
      const newEffectiveTheme = theme === 'system' ? systemTheme : theme
      root.classList.add(newEffectiveTheme) // Add the new theme class
      setEffectiveTheme(newEffectiveTheme as 'dark' | 'light')
    }

    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system')
      }
    }

    applyTheme(theme)

    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = (theme: Theme) => {
    localStorage.setItem(storageKey, theme)
    _setTheme(theme)
  }

  const value = {
    theme,
    effectiveTheme,
    setTheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
