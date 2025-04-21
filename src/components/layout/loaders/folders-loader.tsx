import { IconFolder } from "@tabler/icons-react"
import { NavGroup } from "../nav-group"
import { NavItem } from "../types"

export function FoldersLoader() {
    // Simulate folders to be displayed while loading
    const foldersItems: NavItem[] = []
    for (let i = 0; i < 10; i++) {
        foldersItems.push({
            title: "",
            icon: IconFolder,
            items: [],
            classes: "skeleton-loading text-xs ml-4 px-2 w-32 inline-flex border font-medium overflow-hidden border-transparent bg-primary text-primary-foreground rounded-sm h-2 opacity-50"
        })
    }
    return <NavGroup key='folders' title='General' items={foldersItems} />
}