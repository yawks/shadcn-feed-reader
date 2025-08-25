import { FeedItem } from '@/backends/types'
import React from 'react'

interface SearchContextType {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  searchQuery: string
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>
  searchResults: FeedItem[]
  setSearchResults: React.Dispatch<React.SetStateAction<FeedItem[]>>
  isSearching: boolean
  setIsSearching: React.Dispatch<React.SetStateAction<boolean>>
  searchError: string | null
  setSearchError: React.Dispatch<React.SetStateAction<string | null>>
  isSearchMode: boolean
  setIsSearchMode: React.Dispatch<React.SetStateAction<boolean>>
  clearSearchMode: () => void
}

const SearchContext = React.createContext<SearchContextType | null>(null)

interface Props {
  readonly children: React.ReactNode
}

export function SearchProvider({ children }: Props) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<FeedItem[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [searchError, setSearchError] = React.useState<string | null>(null)
  const [isSearchMode, setIsSearchMode] = React.useState(false)

  const clearSearchMode = React.useCallback(() => {
    setOpen(false)
    setIsSearchMode(false)
    setSearchResults([])
    setSearchQuery('')
    setSearchError(null)
  }, [])

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      searchQuery,
      setSearchQuery,
      searchResults,
      setSearchResults,
      isSearching,
      setIsSearching,
      searchError,
      setSearchError,
      isSearchMode,
      setIsSearchMode,
      clearSearchMode,
    }),
    [open, searchQuery, searchResults, isSearching, searchError, isSearchMode, clearSearchMode]
  )

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSearch = () => {
  const searchContext = React.useContext(SearchContext)

  if (!searchContext) {
    throw new Error('useSearch has to be used within <SearchContext.Provider>')
  }

  return searchContext
}
