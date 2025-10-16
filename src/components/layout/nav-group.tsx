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
import { IconNews } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'

const NavBadge = ({ children }: { children: React.ReactNode }) => (
  <Badge className='rounded-full px-2 py-0.5 text-xs font-medium bg-sidebar-accent/10 text-sidebar-accent-foreground border-sidebar-accent/20 shadow-sm'>
    {children}
  </Badge>
)



// SidebarMenuLink component for non-collapsible items (feeds)
function SidebarMenuLink({ item, href }: { item: NavItem; href: string }) {
  const { setOpenMobile } = useSidebar()
  const [, setSelectedFolderOrFeed] = useState<NavItem | null>(null)
  const isActive = checkIsActive(href, item)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton 
        tooltip={item.title} 
        isActive={isActive}
        className="group transition-all duration-200 hover:bg-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:border-sidebar-accent/20"
      >
        <Link 
          to={('url' in item ? item.url : ".") ?? "."} 
          onClick={() => {
            setOpenMobile(false)
            setSelectedFolderOrFeed(item)
          }} 
          className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 flex-1"
        >
          <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {item.icon ? <item.icon className={`transition-colors duration-200 ${isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} /> : null}
            {item.iconUrl ? (
              <img 
                src={item.iconUrl} 
                alt={item.title} 
                className="w-4 h-4 rounded-sm ring-1 ring-border/10 transition-transform duration-200 group-hover:scale-110"
              />
            ) : null}
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
  )
}

// SidebarMenuCollapsible component for folders with context menu and inline rename
function SidebarMenuCollapsible({ item, href }: { item: NavCollapsible; href: string }) {
  const { setOpenMobile } = useSidebar()
  const [, setSelectedFolderOrFeed] = useState<NavItem | null>(null)
  const queryClient = useQueryClient()
  const isActive = checkIsActive(href, item)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(item.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hovered, setHovered] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleRename = async () => {
    console.log('handleRename called!', { renameValue, originalTitle: item.title }) // Debug: vérifier si la fonction est appelée
    setIsRenaming(false)
    if (renameValue.trim() && renameValue !== item.title) {
      try {
        // Pour un dossier (NavCollapsible), on utilise directement son URL qui contient l'ID
        // Les dossiers ont une URL ajoutée dynamiquement même si le type ne le permet pas
        const itemUrl = (item as { url?: string }).url
        const folderId = (itemUrl as string)?.split('/').pop()
        console.log('Extracted folderId:', folderId, 'from itemUrl:', itemUrl) // Debug log
        if (folderId) {
          console.log('Renaming folder:', folderId, 'to:', renameValue) // Debug log
          const FeedBackend = (await import('@/backends/nextcloud-news/nextcloud-news')).default
          const backend = new FeedBackend()
          await backend.renameFolder(folderId, renameValue)
          console.log('Folder renamed successfully') // Debug log
          // Invalider le cache pour re-fetch les dossiers
          await queryClient.invalidateQueries({ queryKey: ['folders'] })
        } else {
          console.log('No folderId found, skipping rename')
        }
      } catch (error) {
        console.error('Erreur lors du renommage du dossier:', error) // Debug log
      }
    } else {
      console.log('Skipping rename: empty value or same name')
    }
  }

  React.useEffect(() => {
    if (isRenaming && inputRef.current) {
      console.log('useEffect: Setting focus on input in 200ms')
      // Délai pour s'assurer que le DOM est mis à jour après fermeture du menu
      setTimeout(() => {
        console.log('useEffect: Focusing input now')
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
    } catch (error) {
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
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton 
            tooltip={item.title} 
            isActive={isActive}
            className="group transition-all duration-200 hover:bg-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:border-sidebar-accent/20"
          >
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 flex-1">
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
                                            onBlur={() => {
                            console.log('Input onBlur triggered!')
                            handleRename()
                          }}
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
            {item.items.map((subItem) => {
              const isSubActive = checkIsActive(href, subItem)
              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isSubActive}
                    className="group transition-all duration-200 hover:bg-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:border-l-2 data-[active=true]:border-sidebar-accent"
                  >
                    <Link to={('url' in subItem ? subItem.url : ".") ?? "."} className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1">
                      {subItem.title}
                      {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
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
    !!item?.items?.filter((i) => i.url === href).length // if child nav is active
  )
  return isActive;
}

export function NavGroup({ title, items }: Readonly<NavGroupType>) {
  const { state } = useSidebar();
  const href = useLocation({ select: (location) => location.href });
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
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
