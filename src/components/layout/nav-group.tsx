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
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
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
import { Input } from '@/components/ui/input'
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

// Helper: apply a move of a feed between folders (or to root when folderId is null)
function moveFeedInFolders(old: FolderCacheItem[] | undefined, feedId: string, folderId: string | null): FolderCacheItem[] | undefined {
  if (!old) return old
  let movedFeed: { title: string; url: string; badge?: string } | null = null
  let feedUnreadCount = 0

  const without = old.map((f) => {
    if (!f.items) return f
    const feedToMove = f.items.find((s) => s.url === `/feed/${feedId}`)
    if (feedToMove && feedToMove.url) {
      movedFeed = { ...feedToMove, url: feedToMove.url }
      feedUnreadCount = feedToMove.badge ? parseInt(feedToMove.badge) || 0 : 0
      const currentFolderUnread = f.badge ? parseInt(f.badge) || 0 : 0
      const newFolderUnread = Math.max(0, currentFolderUnread - feedUnreadCount)
      return { ...f, items: f.items.filter((s) => s.url !== `/feed/${feedId}`), badge: newFolderUnread > 0 ? String(newFolderUnread) : undefined }
    }
    return f
  })

  if (!folderId) return without

  return without.map((f) => {
    if (!f.items) return f
    const id = f.id ?? f.url
    if ((f.url ?? '').endsWith(`/folder/${folderId}`) || String(id) === String(folderId)) {
      const currentFolderUnread = f.badge ? parseInt(f.badge) || 0 : 0
      const newFolderUnread = currentFolderUnread + feedUnreadCount
      return { ...f, items: [...f.items, movedFeed || { url: `/feed/${feedId}`, title: 'Moved Feed' }], badge: newFolderUnread > 0 ? String(newFolderUnread) : undefined }
    }
    return f
  })
}

function doesFeedHaveFolder(folders: FolderCacheItem[] | undefined, feedId: string | null) {
  if (!folders || !feedId) return false
  for (const f of folders) {
    if (f.items && f.items.find((s) => s.url === `/feed/${feedId}`)) return true
  }
  return false
}

const NavBadge = ({ children }: { children: React.ReactNode }) => (
  <Badge className='rounded-full px-2 py-0.5 text-xs font-medium bg-sidebar-accent/10 text-sidebar-accent-foreground border-sidebar-accent/20 shadow-sm'>
    {children}
  </Badge>
)

/* temporary: keep debug logs during DnD work - remove before final commit */


// SidebarMenuLink component for non-collapsible items (feeds)
function SidebarMenuLink({ item, href, onDragStateChange }: { item: NavItem; href: string; onDragStateChange?: (v: boolean, hasFolder?: boolean) => void }) {
  const { setOpenMobile: _setOpenMobile } = useSidebar()
  const [, _setSelectedFolderOrFeed] = useState<NavItem | null>(null)
  const isActive = checkIsActive(href, item)
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const itemUrl = (item as { url?: string }).url
  const feedId = (itemUrl as string)?.split('/').pop() ?? null
  
  // Ref to disable link during drag
  const linkRef = useRef<HTMLAnchorElement>(null)
  const pointerEventsDisabledRef = useRef(false)
  // Manual drag refs for top-level items (use manual ghost like subrows)
  const dragSourceElRef = useRef<HTMLElement | null>(null)
  const dragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  const manualGhostRef = useRef<HTMLElement | null>(null)
  const manualMouseMoveHandler = useRef<((ev: MouseEvent) => void) | null>(null)
  const manualMouseUpHandler = useRef<((ev: MouseEvent) => void) | null>(null)
  const [isManualDragging, setIsManualDragging] = useState(false)

  // Start manual drag for top-level feed
  const startManualDrag = () => {
    if (isManualDragging) return
    setIsManualDragging(true)
    const el = (dragSourceElRef.current ?? linkRef.current) as HTMLElement | null
    if (!el) return
    const clone = el.cloneNode(true) as HTMLElement
    clone.style.position = 'fixed'
    clone.style.pointerEvents = 'none'
    clone.style.left = '0px'
    clone.style.top = '0px'
    clone.style.transform = 'translate3d(-9999px, -9999px, 0)'
    clone.style.opacity = '0.95'
    clone.style.zIndex = '9999'
    document.body.appendChild(clone)
    manualGhostRef.current = clone

    manualMouseMoveHandler.current = (ev: MouseEvent) => {
      if (!manualGhostRef.current) return
      manualGhostRef.current.style.transform = `translate3d(${ev.clientX + 8}px, ${ev.clientY + 8}px, 0)`
    }

    manualMouseUpHandler.current = async (ev: MouseEvent) => {
      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      let folderId: string | null = null
      if (target) {
        const folderEl = target.closest('[data-folder-id]') as HTMLElement | null
        if (folderEl) folderId = folderEl.getAttribute('data-folder-id')
      }

      try { if (manualGhostRef.current) document.body.removeChild(manualGhostRef.current) } catch (_e) { /* ignore */ }
      manualGhostRef.current = null
      if (manualMouseMoveHandler.current) document.removeEventListener('mousemove', manualMouseMoveHandler.current as unknown as EventListener)
      if (manualMouseUpHandler.current) document.removeEventListener('mouseup', manualMouseUpHandler.current as unknown as EventListener)
      manualMouseMoveHandler.current = null
      manualMouseUpHandler.current = null
      setIsManualDragging(false)
      dragTimeoutRef.current = null

      if (!feedId) return
      const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
      try {
        queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => moveFeedInFolders(old, feedId, folderId))
        const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
        const backend = new FeedBackend()
        await backend.moveFeed(feedId, folderId ?? null)
        await queryClient.invalidateQueries({ queryKey: ['folders'] })
        toast.message(folderId ? 'Feed moved' : 'Feed moved to root')
      } catch (_err) {
        queryClient.setQueryData(['folders'], prev)
        toast.error('Error moving feed')
      }

      if (linkRef.current) linkRef.current.style.pointerEvents = 'auto'
      pointerEventsDisabledRef.current = false
      if (onDragStateChange) onDragStateChange(false)
    }

    // attach listeners
    if (manualMouseMoveHandler.current) document.addEventListener('mousemove', manualMouseMoveHandler.current as unknown as EventListener)
    if (manualMouseUpHandler.current) document.addEventListener('mouseup', manualMouseUpHandler.current as unknown as EventListener)
    // disable pointer on the real link while dragging
    if (linkRef.current) {
      linkRef.current.style.pointerEvents = 'none'
      pointerEventsDisabledRef.current = true
    }
    if (onDragStateChange) onDragStateChange(true)
  }

  const handleMouseDownTop = (e: React.MouseEvent) => {
    // remember the source element; do NOT disable link interactions here
    // because toggling pointer-events during mousedown can cancel native drag
    dragSourceElRef.current = e.currentTarget as HTMLElement
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    // start a short timer to enable manual drag if user holds the mouse
    if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current)
    dragTimeoutRef.current = setTimeout(() => {
      try { startManualDrag() } catch (_e) { /* ignore */ }
    }, 200)
  }

  const handleMouseUpTop = () => {
    // cancel pending manual drag if mouse released quickly
    if (dragTimeoutRef.current) { clearTimeout(dragTimeoutRef.current); dragTimeoutRef.current = null }
    mouseDownPos.current = null
    // Re-enable only if a drag didn't start; if a drag started, handleMouseUp in manual handler will re-enable
    if (pointerEventsDisabledRef.current && !isManualDragging && linkRef.current) {
      linkRef.current.style.pointerEvents = 'auto'
      pointerEventsDisabledRef.current = false
    }
  }

  const handleMouseMoveTop = (e: React.MouseEvent) => {
    if (!mouseDownPos.current) return
    const dx = Math.abs(e.clientX - mouseDownPos.current.x)
    const dy = Math.abs(e.clientY - mouseDownPos.current.y)
    if ((dx > 6 || dy > 6) && !isManualDragging) {
      // cancel timeout and start manual drag immediately
      if (dragTimeoutRef.current) { clearTimeout(dragTimeoutRef.current); dragTimeoutRef.current = null }
      try { startManualDrag() } catch (_e) { /* ignore */ }
    }
  }

  // Pointer-event based manual drag using setPointerCapture for reliable pointer movement across devices
  const handlePointerDownTop = (e: React.PointerEvent) => {
    // store source and initial position
    dragSourceElRef.current = e.currentTarget as HTMLElement
    mouseDownPos.current = { x: e.clientX, y: e.clientY }

    const pointerId = e.pointerId
    const sourceEl = e.currentTarget as Element
    try { sourceEl.setPointerCapture(pointerId) } catch (_e) { /* ignore if not supported */ }

    let started = false

    const handlePointerMove = (ev: PointerEvent) => {
      const dx = Math.abs(ev.clientX - (mouseDownPos.current?.x ?? 0))
      const dy = Math.abs(ev.clientY - (mouseDownPos.current?.y ?? 0))
      if (!started && (dx > 6 || dy > 6)) {
        started = true
        // decide whether this feed currently lives in a folder
        const hasFolder = doesFeedHaveFolder(queryClient.getQueryData<FolderCacheItem[]>(['folders']), feedId)
        // start manual drag and inform parent whether Root should be shown
        try { startManualDrag() } catch (_e) { /* ignore */ }
        if (onDragStateChange) onDragStateChange(true, hasFolder)
      }
      // if already started the manual drag, forward to the ghost-positioning logic
      if (started && manualGhostRef.current) {
        manualGhostRef.current.style.transform = `translate3d(${ev.clientX + 8}px, ${ev.clientY + 8}px, 0)`
      }
    }

    const _onPointerUp = async (ev: PointerEvent) => {
      // release pointer capture
      try { sourceEl.releasePointerCapture(pointerId) } catch (_e) { /* ignore */ }
    mouseDownPos.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', _onPointerUp)

      if (!started) {
        // it was a click/short press; nothing to finalize here
        return
      }

      // finalize manual drag: reuse manualMouseUpHandler logic to perform move
      if (manualMouseUpHandler.current) {
        try { manualMouseUpHandler.current(ev as unknown as MouseEvent) } catch (_e) { /* ignore */ }
      }
      // tell parent drag ended
      if (onDragStateChange) onDragStateChange(false)
    }
    if (linkRef.current) {
      linkRef.current.style.pointerEvents = 'none'
      pointerEventsDisabledRef.current = true
    }

    // register pointer listeners
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', _onPointerUp)

    manualMouseMoveHandler.current = (ev: MouseEvent) => {
      if (!manualGhostRef.current) return
      // use translate3d for smoother GPU-accelerated movement
      manualGhostRef.current.style.transform = `translate3d(${ev.clientX + 8}px, ${ev.clientY + 8}px, 0)`
    }

    manualMouseUpHandler.current = async (ev: MouseEvent) => {
      // Detect drop target
      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      let folderId: string | null = null
      if (target) {
        const folderEl = target.closest('[data-folder-id]') as HTMLElement | null
        if (folderEl) folderId = folderEl.getAttribute('data-folder-id')
      }
      // Cleanup ghost
      try { if (manualGhostRef.current) document.body.removeChild(manualGhostRef.current) } catch (_e) { /* ignore cleanup errors */ }
      manualGhostRef.current = null
      if (manualMouseMoveHandler.current) document.removeEventListener('mousemove', manualMouseMoveHandler.current)
      if (manualMouseUpHandler.current) document.removeEventListener('mouseup', manualMouseUpHandler.current)
      manualMouseMoveHandler.current = null
      manualMouseUpHandler.current = null
      setIsManualDragging(false)
      dragTimeoutRef.current = null
      // Move feed if dropped on a folder or root (folderId null -> root)
      if (!feedId) return
      const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
      // Only move if pointer is released over a folder or root
      if (folderId !== null || target?.classList.contains('root-drop-target')) {
        try {
          queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => moveFeedInFolders(old, feedId, folderId))
          const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
          const backend = new FeedBackend()
          await backend.moveFeed(feedId, folderId ?? null)
          await queryClient.invalidateQueries({ queryKey: ['folders'] })
          toast.message(folderId ? 'Feed moved' : 'Feed moved to root')
        } catch (_err) {
          queryClient.setQueryData(['folders'], prev)
          toast.error('Error moving feed')
        }
      }
      // Restore link interactions
      if (linkRef.current) linkRef.current.style.pointerEvents = 'auto'
      pointerEventsDisabledRef.current = false
      if (onDragStateChange) onDragStateChange(false)
    }

  if (onDragStateChange) onDragStateChange(true)
    if (manualMouseMoveHandler.current) document.addEventListener('mousemove', manualMouseMoveHandler.current)
    if (manualMouseUpHandler.current) document.addEventListener('mouseup', manualMouseUpHandler.current)
  }
  
  // Note: top-level native HTML5 drag is intentionally disabled for top-level items
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
      toast.message('Feed renamed')
    } catch (_err) {
      // rollback
      queryClient.setQueryData(['folders'], prev)
      toast.error('Error renaming feed')
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
      toast.message('Feed removed')
    } catch (_err) {
      queryClient.setQueryData(['folders'], prev)
      toast.error('Error removing feed')
    }
  }
  return (
    <>
    <SidebarMenuItem 
      draggable={false}
      onMouseDown={handleMouseDownTop}
      onMouseMove={handleMouseMoveTop}
      onMouseUp={handleMouseUpTop}
      onMouseLeave={() => { handleMouseUpTop(); setHovered(false); }}
      onMouseEnter={() => setHovered(true)} 
      onTouchStart={onTouchStart} 
      onTouchEnd={onTouchEnd} 
      onTouchCancel={onTouchEnd} 
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); setHovered(true); }}
      onPointerDown={handlePointerDownTop}
    >
      <SidebarMenuButton 
        asChild
        tooltip={item.title} 
        isActive={isActive}
        className="group transition-all duration-200 hover:bg-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:border-sidebar-accent/20"
      >
          <Link 
            ref={linkRef}
            to={('url' in item ? item.url : ".") ?? "."}
            draggable={false}
            // native HTML5 drag handlers disabled for top-level manual DnD
            onClick={() => {
              _setOpenMobile(false)
              _setSelectedFolderOrFeed(item)
            }} 
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 flex-1 cursor-pointer"
          >
          <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-accent focus:outline-none"
                  aria-label="Plus d'actions"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v) }}
                >
                  {hovered || menuOpen ? (
                    <MoreVertical className="w-4 h-4 text-muted-foreground transition-colors duration-200 hover:text-foreground" />
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
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4} className="min-w-[140px]">
                <DropdownMenuItem onSelect={() => { 
                  setMenuOpen(false);
                  if (feedId) setFeedToRename({ id: feedId, title: item.title })
                }}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setMenuOpen(false); if (feedId) setFeedToDelete({ id: feedId, title: item.title }) }} variant="destructive">
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
      title="Rename the feed"
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
      title="Remove the feed?"
      desc={`Are you sure you want to remove the feed ${feedToDelete?.title ?? ''}? This action is irreversible.`}
      handleConfirm={async () => {
        if (!feedToDelete) return
        await handleFeedDeleteConfirmed(feedToDelete.id)
        setFeedToDelete(null)
      }}
      confirmText="Remove"
      cancelBtnText="Cancel"
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
function SidebarMenuCollapsible({ item, href, onDragStateChange }: { item: NavCollapsible; href: string, onDragStateChange?: (v: boolean, hasFolder?: boolean) => void }) {
  const { setOpenMobile: _setOpenMobile } = useSidebar()
  const [, _setSelectedFolderOrFeed] = useState<NavItem | null>(null)
  const navigate = useNavigate()
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
        alert('Error while renaming folder')
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
      alert('Error while deleting folder: ' + _error);
    }
  };

  // JSX de la popin (déclarée ici, injectée dans le rendu)
  const deleteConfirmPopin = showDeleteConfirm && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-lg shadow-lg p-6 min-w-[300px]">
        <div className="mb-4 font-semibold text-lg">Remove the folder?</div>
        <div className="mb-6 text-muted-foreground">This action is irreversible. Do you really want to delete the folder <span className="font-bold">{item.title}</span>?</div>
        <div className="flex gap-2 justify-end">
          <button className="px-4 py-2 rounded bg-muted text-foreground" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
          <button className="px-4 py-2 rounded bg-destructive text-destructive-foreground" onClick={handleDelete}>Delete</button>
        </div>
      </div>
    </div>
  );

  const itemUrl = (item as { url?: string }).url
  const folderIdAttr = itemUrl
    ? (itemUrl as string).split('/').pop() ?? String((item as unknown as { id?: string | number }).id ?? '')
    : String((item as unknown as { id?: string | number }).id ?? '')

  return (
    <Collapsible
      asChild
      defaultOpen={isActive}
      className='group/collapsible'
    >
      <SidebarMenuItem
        data-folder-id={folderIdAttr}
        className={`relative transition-colors ${isDragOver ? 'bg-accent/50 ring-2 ring-accent' : ''}`}
        onDragOver={(e) => { 
          e.preventDefault(); 
          // dataTransfer may not exist on synthetic events but this handler runs for native drag
          try { (e as unknown as DragEvent).dataTransfer!.dropEffect = 'move' } catch (_e) { /* ignore */ }
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          // Only hide if we're leaving the entire folder area
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
          }
        }}
        onDrop={async (e) => {
          // DROP on folder (debug)
          e.preventDefault()
          setIsDragOver(false)
          const feedId = (e as unknown as DragEvent).dataTransfer?.getData('application/x-feed-id')
          // Received feedId from drop
          if (!feedId) {
            // No feedId in drop event
            return
          }
          // Determine folderId from this item's url
          const itemUrl = (item as { url?: string }).url
          const folderId = itemUrl ? (itemUrl as string).split('/').pop() ?? null : null
          const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
          try {
            // optimistic move: remove from any folder and add to this folder
            queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => moveFeedInFolders(old, feedId, folderId))
            // call backend
            const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
            const backend = new FeedBackend()
            await backend.moveFeed(feedId, folderId)
          } catch (_error) {
            // revert on error
            queryClient.setQueryData(['folders'], prev)
          }
        }}
      >
        <div className="flex items-center gap-0">
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 flex-1 cursor-pointer hover:bg-accent/80"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); setHovered(true) }}
            onClick={() => {
              _setOpenMobile(false);
              _setSelectedFolderOrFeed(item);
              const url = (item as { url?: string }).url;
              if (url) navigate({ to: url });
            }}
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
                    <DropdownMenuItem onSelect={() => { setMenuOpen(false); setIsRenaming(true) }}>
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setMenuOpen(false); setShowDeleteConfirm(true) }} variant="destructive">
                      Remove
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
            {isRenaming ? (
              <Input
                ref={inputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(item.title) }
                }}
                onBlur={handleRename}
                className="h-6 text-sm font-medium flex-1 max-w-[150px] transition-all duration-200 focus:ring-2 focus:ring-sidebar-accent"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className={`font-medium flex-1 transition-colors duration-200 ${item.classes ?? ''} ${
                  isActive ? 'text-sidebar-accent-foreground' : 'text-foreground group-hover:text-foreground'
                }`}
              >
                {item.title}
              </span>
            )}
            {item.badge && !isRenaming && (
              <div className="flex-shrink-0">
                <NavBadge>{item.badge}</NavBadge>
              </div>
            )}
          </div>
          <CollapsibleTrigger asChild>
            <button 
              className='px-2 py-2 hover:bg-accent/50 rounded transition-colors cursor-pointer'
              aria-label="Toggle folder"
            >
              <ChevronRight 
                className='h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-muted-foreground hover:text-foreground' 
              />
            </button>
          </CollapsibleTrigger>
        </div>
        {deleteConfirmPopin}
        <CollapsibleContent className='CollapsibleContent'>
          <SidebarMenuSub className="space-y-1 px-2">
            {item.items?.map((subItem) => (
              <SidebarMenuSubRow key={`${subItem.url}-${subItem.title}`} subItem={subItem} parentItem={item} href={href} onDragStateChange={onDragStateChange} />
            )) || []}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

// Sub-row component: render a subitem (feed) with its own 3-dots menu and mobile long-press
function SidebarMenuSubRow({ subItem, parentItem, href, onDragStateChange }: { subItem: NavLink, parentItem: NavCollapsible, href: string, onDragStateChange?: (_v: boolean, _hasFolder?: boolean) => void }) {
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
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  const [isDraggingThisItem, setIsDraggingThisItem] = useState(false)
  const [isDragEnabled, setIsDragEnabled] = useState(false)
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  
  const handleMouseDown = (e: React.MouseEvent) => {
  // Mouse down on subitem
    // Enregistrer la position initiale de la souris
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    
    // Activer le drag après 300ms (clic prolongé)
    if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current)
    dragTimeoutRef.current = setTimeout(() => {
      setIsDragEnabled(true)
  try { startManualDrag() } catch (_e) { /* failed to start manual drag */ }
    }, 300)
  }
  
  const handleMouseUp = () => {
  // Mouse up
    // Annuler le timeout si l'utilisateur relâche rapidement (clic simple)
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current)
      dragTimeoutRef.current = null
    }
    setIsDragEnabled(false)
  }

  // Manual drag variables
  const manualGhostRef = useRef<HTMLElement | null>(null)
  const manualMouseMoveHandler = useRef<((ev: MouseEvent) => void) | null>(null)
  const manualMouseUpHandler = useRef<((ev: MouseEvent) => void) | null>(null)

  const startManualDrag = () => {
    if (isDraggingThisItem) return
    setIsDraggingThisItem(true)
    // create ghost
    const el = linkRef.current?.closest('[data-slot=sidebar-menu-sub-item]') as HTMLElement | null
    if (!el) return
    const clone = el.cloneNode(true) as HTMLElement
    clone.style.position = 'fixed'
    clone.style.pointerEvents = 'none'
    clone.style.left = '0px'
    clone.style.top = '0px'
    clone.style.transform = 'translate(-9999px, -9999px)'
    clone.style.opacity = '0.95'
    clone.style.zIndex = '9999'
    document.body.appendChild(clone)
    manualGhostRef.current = clone

    manualMouseMoveHandler.current = (ev: MouseEvent) => {
      if (!manualGhostRef.current) return
      manualGhostRef.current.style.transform = `translate(${ev.clientX + 8}px, ${ev.clientY + 8}px)`
    }
    manualMouseUpHandler.current = async (ev: MouseEvent) => {
      // Detect drop target
      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      let folderId: string | null = null
      if (target) {
        const folderEl = target.closest('[data-folder-id]') as HTMLElement | null
        if (folderEl) folderId = folderEl.getAttribute('data-folder-id')
      }
      // Cleanup ghost
      try { if (manualGhostRef.current) document.body.removeChild(manualGhostRef.current) } catch (_e) { /* ignore */ }
      manualGhostRef.current = null
      if (manualMouseMoveHandler.current) document.removeEventListener('mousemove', manualMouseMoveHandler.current)
      if (manualMouseUpHandler.current) document.removeEventListener('mouseup', manualMouseUpHandler.current)
      manualMouseMoveHandler.current = null
      manualMouseUpHandler.current = null
      setIsDraggingThisItem(false)
      setIsDragEnabled(false)

      // Move feed if dropped on a folder or root (folderId null -> root)
      const feedId = extractFeedIdFromUrl(subItem.url)
      if (!feedId) return
      const prev = queryClient.getQueryData<FolderCacheItem[]>(['folders'])
      if (folderId !== null || target?.classList.contains('root-drop-target')) {
        try {
          queryClient.setQueryData<FolderCacheItem[]>(['folders'], (old) => moveFeedInFolders(old, feedId, folderId))
          const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
          const backend = new FeedBackend()
          await backend.moveFeed(feedId, folderId ?? null)
          await queryClient.invalidateQueries({ queryKey: ['folders'] })
          toast.message(folderId ? 'Feed moved' : 'Feed moved to root')
        } catch (_err) {
          queryClient.setQueryData(['folders'], prev)
          toast.error('Error moving feed')
        }
      }
    }

    if (onDragStateChange) onDragStateChange(true)
    if (manualMouseMoveHandler.current) document.addEventListener('mousemove', manualMouseMoveHandler.current)
    if (manualMouseUpHandler.current) document.addEventListener('mouseup', manualMouseUpHandler.current)
  }
  
  
  
  const handleLinkClick = (e: React.MouseEvent) => {
    // Si on vient de finir un drag, empêcher la navigation
    if (isDraggingThisItem) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // Si la souris a bougé significativement depuis mouseDown, c'était probablement un drag
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x)
      const dy = Math.abs(e.clientY - mouseDownPos.current.y)
      if (dx > 5 || dy > 5) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
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
      toast.message('Feed renamed')
    } catch (_err) {
      queryClient.setQueryData(['folders'], prev)
      toast.error('Error renaming feed')
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
      toast.message('Feed removed')
    } catch (_err) {
      queryClient.setQueryData(['folders'], prev)
      toast.error('Error removing feed')
    }
  }

  return (
    <>
    <SidebarMenuSubItem
      draggable={false}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={isDragEnabled ? "cursor-grabbing" : "cursor-pointer"}
    >
      <SidebarMenuSubButton asChild isActive={isSubActive} className="group transition-all duration-200 hover:bg-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:border-l-2 data-[active=true]:border-sidebar-accent">
        <Link
          ref={linkRef}
          to={subItem.url}
          onClick={handleLinkClick}
          className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); setHovered(true); }}
        >
          <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-accent focus:outline-none"
                  aria-label="Plus d'actions"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v) }}
                >
                  {hovered || menuOpen ? (
                    <MoreVertical className="w-4 h-4 text-muted-foreground transition-colors duration-200 hover:text-foreground" />
                  ) : (
                    getSubItemIcon(subItem as NavItem, parentItem)
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4} className="min-w-[140px]">
                <DropdownMenuItem onSelect={() => { 
                  setMenuOpen(false);
                  const feedId = extractFeedIdFromUrl(subItem.url);
                  if (feedId) setSubFeedToRename({ id: feedId, title: subItem.title })
                }}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { 
                  setMenuOpen(false);
                  const feedId = extractFeedIdFromUrl(subItem.url);
                  if (feedId) setSubFeedToDelete({ id: feedId, title: subItem.title })
                }} variant="destructive">
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <span className="flex-1">{subItem.title}</span>
          {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
    <RenameDialog
      open={!!subFeedToRename}
      onOpenChange={(open) => { if (!open) setSubFeedToRename(null) }}
      title="Rename the feed"
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
      title="Delete the feed ?"
      desc={`Do you really want to delete the feed ${subFeedToDelete?.title ?? ''} ? This action is irreversible.`}
      handleConfirm={async () => {
        if (!subFeedToDelete) return
        await handleSubFeedDeleteConfirmed(subFeedToDelete.id)
        setSubFeedToDelete(null)
      }}
      confirmText="Remove"
      cancelBtnText="Cancel"
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
  const [isDragging, setIsDragging] = useState(false)
  const [isRootHovered, setIsRootHovered] = useState(false)
  
  // Root drop handlers
  const handleRootDragOver = (e: React.DragEvent) => { 
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move'
    setIsRootHovered(true)
  }
  
  const handleRootDragLeave = () => {
    setIsRootHovered(false)
  }
  
  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsRootHovered(false)
    setIsDragging(false)
    const feedId = e.dataTransfer.getData('application/x-feed-id')
    if (!feedId) {
      return
    }
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
      toast.message('Feed moved to root')
    } catch (_err) {
      queryClient.setQueryData(['folders'], prev)
      toast.error('Error moving feed')
    }
  }
  
  const handleDragStateChange = (dragging: boolean, hasFolder?: boolean) => {
    // Only show Root placeholder when dragging and the dragged feed came from a folder
    setIsDragging(dragging && !!hasFolder)
  }
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {/* Root pseudo-folder drop target - only visible during drag */}
        {isDragging && (
          <div
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
            className={`px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium ${
              isRootHovered 
                ? 'bg-accent ring-2 ring-accent text-accent-foreground' 
                : 'bg-accent/20 text-muted-foreground'
            }`}
            role='button'
            title='Drop here to move feed to root'
          >
            📁 Root Folder
          </div>
        )}
        {items.map((item, index) => {
          let key;
          if (item.title) {
            key = `${item.title}-${'url' in item ? item.url : 'folder'}`;
          } else {
            key = index;
          }
          if (!('items' in item)) {
            return <SidebarMenuLink key={key} item={item} href={href} onDragStateChange={handleDragStateChange} />;
          }
          if (state === 'collapsed') {
            return <SidebarMenuCollapsedDropdown key={key} item={item as NavCollapsible} href={href} />;
          }
          // Use the new SidebarMenuCollapsible for folders
          return <SidebarMenuCollapsible key={key} item={item as NavCollapsible} href={href} onDragStateChange={handleDragStateChange} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
