import React, { createContext, useContext, useEffect, useState } from 'react'

type FontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl'

const fontSizeMap = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px 
  base: '1rem',     // 16px (default)
  lg: '1.125rem',   // 18px
  xl: '1.25rem'     // 20px
}

interface FontSizeContextType {
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined)

export const FontSizeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [fontSize, _setFontSize] = useState<FontSize>(() => {
    const savedSize = localStorage.getItem('fontSize')
    return (savedSize as FontSize) || 'base'
  })

  useEffect(() => {
    const applyFontSize = (size: FontSize) => {
      const root = document.documentElement
      
      // Apply CSS custom properties only for feed items (not folders)
      root.style.setProperty('--font-size-item', fontSizeMap[size])
      
      // Also update the base font size for consistency
      const sizeClasses = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl']
      root.classList.forEach((cls) => {
        if (sizeClasses.some(sizeClass => cls.includes(sizeClass))) {
          root.classList.remove(cls)
        }
      })
    }

    applyFontSize(fontSize)
  }, [fontSize])

  const setFontSize = (size: FontSize) => {
    localStorage.setItem('fontSize', size)
    _setFontSize(size)
  }

  const fontSizes: FontSize[] = ['xs', 'sm', 'base', 'lg', 'xl']
  
  const increaseFontSize = () => {
    const currentIndex = fontSizes.indexOf(fontSize)
    if (currentIndex < fontSizes.length - 1) {
      setFontSize(fontSizes[currentIndex + 1])
    }
  }

  const decreaseFontSize = () => {
    const currentIndex = fontSizes.indexOf(fontSize)
    if (currentIndex > 0) {
      setFontSize(fontSizes[currentIndex - 1])
    }
  }

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize, increaseFontSize, decreaseFontSize }}>
      {children}
    </FontSizeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useFontSize = () => {
  const context = useContext(FontSizeContext)
  if (!context) {
    throw new Error('useFontSize must be used within a FontSizeProvider')
  }
  return context
}
