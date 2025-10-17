"use client"

import { ChevronRight, MoreVertical } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Link, useLocation } from '@tanstack/react-router'
import type { NavCollapsible, NavGroup as NavGroupType, NavItem, NavLink } from './types'
import React, { useRef, useState } from 'react'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'

import { Badge } from '../ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { IconNews } from '@tabler/icons-react'
import { RenameDialog } from '@/components/rename-dialog'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

// Local looser type for the folders cache shape. The runtime items are not strictly
// matching the NavItem union used elsewhere, so use a permissive but typed shape
// to avoid `any` while keeping reasonable type-safety.
type FolderCacheItem = {
  title?: string
  url?: string
  id?: string | number
  badge?: string
  items?: Array<{ title: string; url?: string; badge?: string }>
  [k: string]: unknown
}
// alias intentionally removed; use FolderCacheItem[] directly where needed

const NavBadge = ({ children }: { children: React.ReactNode }) => (
  <Badge className='rounded-full px-2 py-0.5 text-xs font-medium bg-sidebar-accent/10 text-sidebar-accent-foreground border-sidebar-accent/20 shadow-sm'>
    {children}
  </Badge>
)



// SidebarMenuLink component for non-collapsible items (feeds)
function SidebarMenuLink({ item, href }: { item: NavItem; href: string }) {
  const { setOpenMobile: _setOpenMobile } = useSidebar()
  const [, _setSelectedFolderOrFeed] = useState<NavItem | null>(null)
  const isActive = checkIsActive(href, item)
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const itemUrl = (item as { url?: string }).url
  const feedId = (itemUrl as string)?.split('/').pop() ?? null
  // touch handling for mobile long-press
  const touchTimer = useRef<number | null>(null)
  const touchThreshold = 600
  const onTouchStart = () => {
    if (touchTimer.current) window.clearTimeout(touchTimer.current)
    touchTimer.current = window.setTimeout(() => {
      setMenuOpen(true)
      setHovered(true)
    }, touchThreshold) as unknown as number
  }
  const onTouchEnd = () => {
    if (touchTimer.current) { window.clearTimeout(touchTimer.current); touchTimer.current = null }
  }

  React.useEffect(() => {
    return () => { if (touchTimer.current) window.clearTimeout(touchTimer.current) }
  }, [])

  const handleFeedRename = async (newTitle: string) => {
    const itemUrl = (item as { url?: string }).url
    const feedId = (itemUrl as string)?.split('/').pop()
    if (!feedId) return
  const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
      // optimistic update: update any subitem with url `/feed/${feedId}`
      try {
  queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => {
          if (!old) return old
          return old.map((folder) => {
            if (!('items' in folder)) return folder
            return {
              ...folder,
              items: folder.items?.map((sub) => sub.url === `/feed/${feedId}` ? { ...sub, title: newTitle } : sub) ?? []
            }
          })
        })

      const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
      const backend = new FeedBackend()
      await backend.renameFeed(feedId, newTitle)
      // ensure fresh data
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
      toast.message('Flux renommé')
    } catch (_err) {
      // rollback
      queryClient.setQueryData(['folders'], prev)
      toast.error('Erreur lors du renommage du flux')
    }
  }

  const [feedToDelete, setFeedToDelete] = useState<{ id: string; title: string } | null>(null)
  const [feedToRename, setFeedToRename] = useState<{ id: string; title: string } | null>(null)

  const handleFeedDeleteConfirmed = async (feedId: string) => {
  const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
    try {
      // optimistic: remove the feed from folders cache
  queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => {
        if (!old) return old
        return old.map((folder) => {
          if (!('items' in folder)) return folder
          return {
            ...folder,
            items: folder.items?.filter((sub) => sub.url !== `/feed/${feedId}`) ?? []
          }
        })
      })

      const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
      const backend = new FeedBackend()
      await backend.deleteFeed(feedId)
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
      toast.message('Flux supprimé')
    } catch (_err) {
      queryClient.setQueryData(['folders'], prev)
      toast.error('Erreur lors de la suppression du flux')
    }
  }
  return (
    <>
    <SidebarMenuItem onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); setHovered(true); }}>
      <SidebarMenuButton 
        asChild
        tooltip={item.title} 
        isActive={isActive}
        className="group transition-all duration-200 hover:bg-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:border-sidebar-accent/20"
      >
          <Link 
          to={('url' in item ? item.url : ".") ?? "."} 
          onClick={() => {
            _setOpenMobile(false)
            _setSelectedFolderOrFeed(item)
          }} 
          className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 flex-1"
        >
          <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {hovered || menuOpen ? (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    className="w-4 h-4 flex items-center justify-center rounded hover:bg-accent focus:outline-none"
                    aria-label="Plus d'actions"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v) }}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground transition-colors duration-200 hover:text-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4} className="min-w-[140px]">
                  <DropdownMenuItem onSelect={() => { 
                    setMenuOpen(false);
                    if (feedId) setFeedToRename({ id: feedId, title: item.title })
                  }}>
                    Renommer
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { setMenuOpen(false); if (feedId) setFeedToDelete({ id: feedId, title: item.title }) }} variant="destructive">
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              item.icon ? <item.icon className={`transition-colors duration-200 ${isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} /> : (
                item.iconUrl ? (
                  <img 
                    src={item.iconUrl} 
                    alt={item.title} 
                    className="w-4 h-4 rounded-sm ring-1 ring-border/10 transition-transform duration-200 group-hover:scale-110"
                  />
                ) : null
              )
            )}
          </div>
          <span className={`font-medium flex-1 transition-colors duration-200 ${item.classes ?? ''} ${
            isActive ? 'text-sidebar-accent-foreground' : 'text-foreground group-hover:text-foreground'
          }`}> 
            {item.title}
          </span>
          {item.badge && (
            <div className="flex-shrink-0">
              <NavBadge>{item.badge}</NavBadge>
            </div>
          )}
        </Link>
  </SidebarMenuButton>
  </SidebarMenuItem>
  {/* Rename dialog for feeds */}
    <RenameDialog
      open={!!feedToRename}
      onOpenChange={(open) => { if (!open) setFeedToRename(null) }}
      title="Renommer le flux"
      initialValue={feedToRename?.title ?? ''}
      onConfirm={async (value) => {
        if (!feedToRename) return
        await handleFeedRename(value)
        setFeedToRename(null)
      }}
    />
    {/* Confirm dialog for feed deletion */}
    <ConfirmDialog
      open={!!feedToDelete}
      onOpenChange={(open) => { if (!open) setFeedToDelete(null) }}
      title="Supprimer le flux ?"
      desc={`Voulez-vous vraiment supprimer le flux ${feedToDelete?.title ?? ''} ? Cette action est irréversible.`}
      handleConfirm={async () => {
        if (!feedToDelete) return
        await handleFeedDeleteConfirmed(feedToDelete.id)
        setFeedToDelete(null)
      }}
      confirmText="Supprimer"
      cancelBtnText="Annuler"
      destructive
    />
    </>
  )
}

// Helper to extract feedId from a subitem url string like `/feed/123`
function extractFeedIdFromUrl(url?: string) {
  return url ? url.split('/').pop() ?? null : null;
}

// SidebarMenuCollapsible component for folders with context menu and inline rename
function SidebarMenuCollapsible({ item, href, onDragStateChange }: { item: NavCollapsible; href: string, onDragStateChange?: (v: boolean) => void }) {
  const { setOpenMobile: _setOpenMobile } = useSidebar()
  const [, _setSelectedFolderOrFeed] = useState<NavItem | null>(null)
  const queryClient = useQueryClient()
  const isActive = checkIsActive(href, item)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(item.title)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hovered, setHovered] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // Touch / long-press handling for mobile where hover doesn't exist
  const touchTimer = useRef<number | null>(null)
  const touchThreshold = 600 // ms to consider a long-press

  const onTouchStart = (_e: React.TouchEvent) => {
    // start a timer to open the menu if the user long-presses
    if (touchTimer.current) window.clearTimeout(touchTimer.current)
    touchTimer.current = window.setTimeout(() => {
      setMenuOpen(true)
      setHovered(true)
    }, touchThreshold) as unknown as number
  }

  const onTouchEnd = () => {
    // clear timer on touch end/cancel (short tap)
    if (touchTimer.current) {
      window.clearTimeout(touchTimer.current)
      touchTimer.current = null
    }
  }

  // cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (touchTimer.current) window.clearTimeout(touchTimer.current)
    }
  }, [])

  const handleRename = async () => {
    setIsRenaming(false)
    if (renameValue.trim() && renameValue !== item.title) {
      try {
        // Pour un dossier (NavCollapsible), on utilise directement son URL qui contient l'ID
        // Les dossiers ont une URL ajoutée dynamiquement même si le type ne le permet pas
        const itemUrl = (item as { url?: string }).url
        const folderId = (itemUrl as string)?.split('/').pop()
        if (folderId) {
          const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
          const backend = new FeedBackend()
          await backend.renameFolder(folderId, renameValue)
          // Invalider le cache pour re-fetch les dossiers
          await queryClient.invalidateQueries({ queryKey: ['folders'] })
        } else {
          // No folderId found; nothing to rename
        }
      } catch (_error) {
        // Report user-facing error
        alert('Erreur lors du renommage du dossier')
      }
    } else {
      // Skip rename: empty value or same name
    }
  }

  React.useEffect(() => {
    if (isRenaming && inputRef.current) {
      // Délai pour s'assurer que le DOM est mis à jour après fermeture du menu
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 200)
    }
  }, [isRenaming])

  // Handler de suppression
  const handleDelete = async () => {
    const itemUrl = (item as { url?: string }).url;
    const folderId = (itemUrl as string)?.split('/').pop();
    if (!folderId) return;
    try {
      const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default;
      const backend = new FeedBackend();
      await backend.deleteFolder(folderId);
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      setShowDeleteConfirm(false);
    } catch (_error) {
      alert('Erreur lors de la suppression du dossier');
    }
  };

  // JSX de la popin (déclarée ici, injectée dans le rendu)
  const deleteConfirmPopin = showDeleteConfirm && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-lg shadow-lg p-6 min-w-[300px]">
        <div className="mb-4 font-semibold text-lg">Supprimer le dossier ?</div>
        <div className="mb-6 text-muted-foreground">Cette action est irréversible. Voulez-vous vraiment supprimer le dossier <span className="font-bold">{item.title}</span> ?</div>
        <div className="flex gap-2 justify-end">
          <button className="px-4 py-2 rounded bg-muted text-foreground" onClick={() => setShowDeleteConfirm(false)}>Annuler</button>
          <button className="px-4 py-2 rounded bg-destructive text-destructive-foreground" onClick={handleDelete}>Supprimer</button>
        </div>
      </div>
    </div>
  );

  return (
    <Collapsible
      asChild
      defaultOpen={isActive}
      className='group/collapsible'
    >
      <SidebarMenuItem
        className={`relative transition-colors ${isDragOver ? 'bg-accent/50 ring-2 ring-accent' : ''}`}
        onDragOver={(e) => { 
          e.preventDefault(); 
          e.dataTransfer.dropEffect = 'move'; 
          setIsDragOver(true);
          console.log('📁 DRAGOVER FOLDER') // Debug log
        }}
        onDragLeave={(e) => {
          // Only hide if we're leaving the entire folder area
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
            console.log('📁 DRAGLEAVE FOLDER') // Debug log
          }
        }}
        onDrop={async (e) => {
          e.preventDefault()
          setIsDragOver(false)
          console.log('📁 FOLDER DROP EVENT (SidebarMenuItem)') // Debug log
          const feedId = e.dataTransfer.getData('application/x-feed-id')
          console.log('📁 Feed ID from drop:', feedId) // Debug log
          if (!feedId) return
          // Determine folderId from this item's url
          const itemUrl = (item as { url?: string }).url
          const folderId = itemUrl ? (itemUrl as string).split('/').pop() ?? null : null
          const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
          try {
            // optimistic move: remove from any folder and add to this folder
            queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => {
              if (!old) return old
              
              // First, find the feed being moved and its unreadCount
              let movedFeed: { title: string; url: string; badge?: string } | null = null
              let feedUnreadCount = 0
              
              // Remove from previous folders and capture feed data
              const without = old.map((f) => {
                if (!f.items) return f
                const feedToMove = f.items.find((s) => s.url === `/feed/${feedId}`)
                if (feedToMove && feedToMove.url) {
                  movedFeed = { ...feedToMove, url: feedToMove.url }
                  // Parse badge as unread count
                  feedUnreadCount = feedToMove.badge ? parseInt(feedToMove.badge) || 0 : 0
                  
                  // Update folder's badge (subtract moved feed's unread count)
                  const currentFolderUnread = f.badge ? parseInt(f.badge) || 0 : 0
                  const newFolderUnread = Math.max(0, currentFolderUnread - feedUnreadCount)
                  
                  return { 
                    ...f, 
                    items: f.items.filter((s) => s.url !== `/feed/${feedId}`),
                    badge: newFolderUnread > 0 ? String(newFolderUnread) : undefined
                  }
                }
                return f
              })
              
              // Add to target folder and update its badge
              return without.map((f) => {
                if (!f.items) return f
                const id = f.id ?? f.url
                if ((f.url ?? '').endsWith(`/folder/${folderId}`) || String(id) === String(folderId)) {
                  // Update target folder's badge (add moved feed's unread count)
                  const currentFolderUnread = f.badge ? parseInt(f.badge) || 0 : 0
                  const newFolderUnread = currentFolderUnread + feedUnreadCount
                  
                  return { 
                    ...f, 
                    items: [...f.items, movedFeed || { url: `/feed/${feedId}`, title: 'Moved Feed' }],
                    badge: newFolderUnread > 0 ? String(newFolderUnread) : undefined
                  }
                }
                return f
              })
            })
            // call backend
            const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
            const backend = new FeedBackend()
            await backend.moveFeed(feedId, folderId)
          } catch (error) {
            // revert on error
            queryClient.setQueryData(['folders'], prev)
            console.error('Failed to move feed:', error)
          }
        }}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton 
            asChild
            tooltip={item.title} 
            isActive={isActive}
            className="group transition-all duration-200 hover:bg-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:border-sidebar-accent/20"
          >
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 flex-1"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); setHovered(true); }}
            >
              <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {hovered || menuOpen ? (
                  <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="w-4 h-4 flex items-center justify-center rounded hover:bg-accent focus:outline-none"
                        aria-label="Plus d'actions"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v) }}
                      >
                        <MoreVertical className="w-4 h-4 text-muted-foreground transition-colors duration-200 hover:text-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={4} className="min-w-[140px]">
                      <DropdownMenuItem onSelect={() => { 
                        setMenuOpen(false); 
                        setTimeout(() => {
                          setIsRenaming(true);
                        }, 150);
                      }}>
                        Renommer
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => {
                        setMenuOpen(false);
                        setTimeout(() => {
                          setShowDeleteConfirm(true);
                        }, 150);
                      }} variant="destructive">
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <IconNews className="w-4 h-4 text-muted-foreground" />
                )}
                {deleteConfirmPopin}
              </div>
              {isRenaming ? (
                <input
                  ref={inputRef}
                  className="font-medium flex-1 bg-transparent border-b border-accent outline-none px-1 text-foreground"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                                            onBlur={() => { handleRename() }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename()
                    if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(item.title) }
                  }}
                  style={{ minWidth: 0 }}
                />
              ) : (
                <span className={`font-medium flex-1 transition-colors duration-200 ${item.classes ?? ''} ${
                  isActive ? 'text-sidebar-accent-foreground' : 'text-foreground group-hover:text-foreground'
                }`}>
                  {item.title}
                </span>
              )}
              {item.badge && (
                <div className="flex-shrink-0">
                  <NavBadge>{item.badge}</NavBadge>
                </div>
              )}
              <ChevronRight className='ml-2 h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-muted-foreground group-hover:text-foreground' />
            </div>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className='CollapsibleContent'>
          <SidebarMenuSub className="space-y-1 px-2">
            {item.items?.map((subItem) => (
              <SidebarMenuSubRow key={subItem.title} subItem={subItem} parentItem={item} href={href} onDragStateChange={onDragStateChange} />
            )) || []}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

// Sub-row component: render a subitem (feed) with its own 3-dots menu and mobile long-press
function SidebarMenuSubRow({ subItem, parentItem, href, onDragStateChange }: { subItem: NavLink, parentItem: NavCollapsible, href: string, onDragStateChange?: (v: boolean) => void }) {
  const isSubActive = checkIsActive(href, subItem as NavItem)
  const queryClient = useQueryClient()
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const touchTimer = useRef<number | null>(null)
  const touchThreshold = 600

  const onTouchStart = () => {
    if (touchTimer.current) window.clearTimeout(touchTimer.current)
    touchTimer.current = window.setTimeout(() => { setMenuOpen(true); setHovered(true) }, touchThreshold) as unknown as number
  }
  const onTouchEnd = () => { if (touchTimer.current) { window.clearTimeout(touchTimer.current); touchTimer.current = null } }
  React.useEffect(() => () => { if (touchTimer.current) window.clearTimeout(touchTimer.current) }, [])

  // Drag & Drop handlers
  const dragDataKey = 'application/x-feed-id'
  const handleDragStart = (e: React.DragEvent) => {
    const feedId = extractFeedIdFromUrl(subItem.url)
    if (!feedId) return
    console.log('🟢 DRAGSTART:', feedId, subItem.url) // Debug log
    e.dataTransfer.setData(dragDataKey, feedId)
    // Add a dragging class for visual feedback
    e.dataTransfer.effectAllowed = 'move'
    // mobile fallback: set a flag on body for styles
    try { document.body.setAttribute('data-dragging-feed', feedId) } catch (_e) { /* ignore */ }
    if (onDragStateChange) onDragStateChange(true)
  }

  const handleDragEnd = (_e: React.DragEvent) => {
    console.log('🔴 DRAGEND') // Debug log
    try { document.body.removeAttribute('data-dragging-feed') } catch (_e) { /* ignore */ }
    if (onDragStateChange) onDragStateChange(false)
  }  // rename handled via dialog state (see below)
  const [subFeedToDelete, setSubFeedToDelete] = useState<{ id: string; title: string } | null>(null)
  const [subFeedToRename, setSubFeedToRename] = useState<{ id: string; title: string } | null>(null)

  const handleSubFeedRenameConfirmed = async (feedId: string, newTitle: string) => {
  const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
    try {
      queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => {
        if (!old) return old
        return old.map((folder) => {
          if (!folder.items) return folder
          return {
            ...folder,
            items: folder.items.map((sub) => sub.url === `/feed/${feedId}` ? { ...sub, title: newTitle } : sub)
          }
        })
      })
      const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
      const backend = new FeedBackend()
      await backend.renameFeed(feedId, newTitle)
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
      toast.message('Flux renommé')
    } catch (_err) {
      queryClient.setQueryData(['folders'], prev)
      toast.error('Erreur lors du renommage du flux')
    }
  }

  const handleSubFeedDeleteConfirmed = async (feedId: string) => {
    const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
    try {
      queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => {
        if (!old) return old
        return old.map((folder) => {
          if (!folder.items) return folder
          return {
            ...folder,
            items: folder.items.filter((sub) => sub.url !== `/feed/${feedId}`)
          }
        })
      })
      const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
      const backend = new FeedBackend()
      await backend.deleteFeed(feedId)
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
      toast.message('Flux supprimé')
    } catch (_err) {
      queryClient.setQueryData(['folders'], prev)
      toast.error('Erreur lors de la suppression du flux')
    }
  }

  return (
    <>
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={isSubActive} className="group transition-all duration-200 hover:bg-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:border-l-2 data-[active=true]:border-sidebar-accent">
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); setHovered(true); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 cursor-move"
        >
          {getSubItemIcon(subItem as NavItem, parentItem)}
          <Link to={subItem.url} className="flex-1 pointer-events-none">{subItem.title}</Link>
          {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
        </div>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
    <RenameDialog
      open={!!subFeedToRename}
      onOpenChange={(open) => { if (!open) setSubFeedToRename(null) }}
      title="Renommer le flux"
      initialValue={subFeedToRename?.title ?? ''}
      onConfirm={async (value) => {
        if (!subFeedToRename) return
        await handleSubFeedRenameConfirmed(subFeedToRename.id, value)
        setSubFeedToRename(null)
      }}
  />
    <ConfirmDialog
      open={!!subFeedToDelete}
      onOpenChange={(open) => { if (!open) setSubFeedToDelete(null) }}
      title="Supprimer le flux ?"
      desc={`Voulez-vous vraiment supprimer le flux ${subFeedToDelete?.title ?? ''} ? Cette action est irréversible.`}
      handleConfirm={async () => {
        if (!subFeedToDelete) return
        await handleSubFeedDeleteConfirmed(subFeedToDelete.id)
        setSubFeedToDelete(null)
      }}
      confirmText="Supprimer"
      cancelBtnText="Annuler"
      destructive
    />
    </>
  )
}

function getSubItemIcon(subItem: NavItem, parentItem: NavCollapsible) {
  if (subItem.iconUrl) {
    return (
      <img 
        src={subItem.iconUrl} 
        alt={subItem.title} 
        className="w-4 h-4 rounded-sm ring-1 ring-border/10 transition-transform duration-200 group-hover:scale-110"
      />
    )
  }
  
  if (parentItem.iconUrl) {
    return (
      <img 
        src={parentItem.iconUrl} 
        alt={parentItem.title} 
        className="w-4 h-4 rounded-sm ring-1 ring-border/10 opacity-60 transition-all duration-200 group-hover:opacity-80 group-hover:scale-110"
      />
    )
  }
  
  return null
};

const SidebarMenuCollapsedDropdown = ({
  item,
  href,
}: {
  item: NavCollapsible
  href: string
}) => {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
          <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            asChild
            tooltip={item.title}
            isActive={checkIsActive(href, item)}
          >
            {item.icon && typeof (item.icon) == "string" ? <img src={item.icon} alt={item.title} className='w-4 h-4'></img> : (
              item.icon && <item.icon />
            )}
            <span className='text-xs'>{item.title}</span>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='right' align='start' sideOffset={4}>
          <DropdownMenuLabel>
            {item.title} {item.badge ? `(${item.badge})` : ''}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub) => (
            <DropdownMenuItem key={`${sub.title}-${sub.url}`} asChild>
              <Link
                to={sub.url}
                className={`${checkIsActive(href, sub) ? 'bg-secondary' : ''}`}
              >
                {item.icon && typeof (item.icon) == "string" ? <><img src={item.icon} alt={item.title} className='w-4 h-4'></img><IconNews className="hidden" /></> : (
                  item.icon && <item.icon />
                )}
                <span className='max-w-52 text-wra text-xs'>{sub.title}</span>
                {sub.badge && (
                  <span className='ml-auto text-xs'>{sub.badge}</span>
                )}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

function checkIsActive(href: string, item: NavItem) {
  
  const isActive = (
    href === item.url || // /endpint?search=param
    href.split('?')[0] === item.url || // endpoint
    !!(item.items && item.items.filter((i) => i.url === href).length) // if child nav is active
  )
  return isActive;
}

export function NavGroup({ title, items }: Readonly<NavGroupType>) {
  const { state } = useSidebar();
  const href = useLocation({ select: (location) => location.href });
  const queryClient = useQueryClient()
  // Root drop handlers
  const handleRootDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const feedId = e.dataTransfer.getData('application/x-feed-id')
    if (!feedId) return
  const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
    try {
      queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => {
        if (!old) return old
        return old.map((f) => {
          if (!f.items) return f
          return { ...f, items: f.items.filter((s) => s.url !== `/feed/${feedId}`) }
        })
      })
      const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
      const backend = new FeedBackend()
      await backend.moveFeed(feedId, null)
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
      toast.message('Flux déplacé vers la racine')
    } catch (_err) {
      queryClient.setQueryData(['folders'], prev)
      toast.error('Erreur lors du déplacement du flux')
    }
  }
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {/* Root pseudo-folder drop target */}
        <div
          onDragOver={handleRootDragOver}
          onDrop={handleRootDrop}
          className='px-3 py-2 rounded-lg hover:bg-accent/50 cursor-pointer text-sm text-muted-foreground'
          role='button'
          title='Drop here to move feed to root'
        >
          Root
        </div>
        {items.map((item, index) => {
          let key;
          if (item.title) {
            key = `${item.title}-${'url' in item ? item.url : 'folder'}`;
          } else {
            key = index;
          }
          if (!('items' in item)) {
            return <SidebarMenuLink key={key} item={item} href={href} />;
          }
          if (state === 'collapsed') {
            return <SidebarMenuCollapsedDropdown key={key} item={item as NavCollapsible} href={href} />;
          }
          // Use the new SidebarMenuCollapsible for folders
          return <SidebarMenuCollapsible key={key} item={item as NavCollapsible} href={href} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
