import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import type { FeedAuthConfig, FeedSelectorConfig, SelectorItem } from './selector-config-types'
import { IconChevronDown, IconChevronUp, IconMinus, IconPlus, IconTrash } from '@tabler/icons-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	generateSelectorId,
	getAuthConfig,
	getSelectorConfig,
	setSelectorConfig,
} from '@/lib/selector-config-storage'
import { useCallback, useEffect, useState } from 'react'

import { AuthConfigTab } from './AuthConfigTab'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface SelectorConfigDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	feedId: string
	feedTitle?: string
	feedUrl?: string
	onConfigSaved?: (hasSelectors: boolean) => void
	onAuthConfigSaved?: (hasAuth: boolean) => void
}

export function SelectorConfigDialog({
	open,
	onOpenChange,
	feedId,
	feedTitle,
	feedUrl,
	onConfigSaved,
	onAuthConfigSaved,
}: SelectorConfigDialogProps) {
	const [activeTab, setActiveTab] = useState('extraction')
	const [selectors, setSelectors] = useState<SelectorItem[]>([])
	const [customCss, setCustomCss] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

	// Auth config state
	const [authConfig, setAuthConfig] = useState<FeedAuthConfig | null>(null)

	const loadConfig = useCallback(async () => {
		setIsLoading(true)
		try {
			const config = await getSelectorConfig(feedId)
			setSelectors(config?.selectors || [])
			setCustomCss(config?.customCss || '')
		} catch (e) {
			console.error('[SelectorConfigDialog] Failed to load config:', e)
			setSelectors([])
			setCustomCss('')
		} finally {
			setIsLoading(false)
		}
	}, [feedId])

	const loadAuthConfig = useCallback(async () => {
		try {
			const auth = await getAuthConfig(feedId)
			setAuthConfig(auth)
		} catch (e) {
			console.error('[SelectorConfigDialog] Failed to load auth config:', e)
			setAuthConfig(null)
		}
	}, [feedId])

	// Load existing config on open
	useEffect(() => {
		if (open && feedId) {
			loadConfig()
			loadAuthConfig()
		}
	}, [open, feedId, loadConfig, loadAuthConfig])

	const addSelector = () => {
		const newSelector: SelectorItem = {
			id: generateSelectorId(),
			selector: '',
			operation: '+',
			order: selectors.length,
		}
		setSelectors([...selectors, newSelector])
	}

	const removeSelector = (id: string) => {
		setSelectors(selectors.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })))
		// Clear validation error for removed selector
		const newErrors = { ...validationErrors }
		delete newErrors[id]
		setValidationErrors(newErrors)
	}

	const updateSelector = (id: string, updates: Partial<SelectorItem>) => {
		setSelectors(selectors.map((s) => (s.id === id ? { ...s, ...updates } : s)))
		// Clear validation error when user edits
		if (updates.selector !== undefined) {
			const newErrors = { ...validationErrors }
			delete newErrors[id]
			setValidationErrors(newErrors)
		}
	}

	const toggleOperation = (id: string) => {
		setSelectors(
			selectors.map((s) => (s.id === id ? { ...s, operation: s.operation === '+' ? '-' : '+' } : s))
		)
	}

	const moveSelector = (fromIndex: number, toIndex: number) => {
		const newSelectors = [...selectors]
		const [moved] = newSelectors.splice(fromIndex, 1)
		newSelectors.splice(toIndex, 0, moved)
		setSelectors(newSelectors.map((s, i) => ({ ...s, order: i })))
	}

	const validateSelector = (selector: string): boolean => {
		if (!selector.trim()) return false
		try {
			document.querySelector(selector)
			return true
		} catch {
			return false
		}
	}

	const handleSaveSelectors = async () => {
		// Validate all selectors
		const errors: Record<string, string> = {}
		let hasErrors = false

		for (const sel of selectors) {
			if (!sel.selector.trim()) {
				errors[sel.id] = 'Le sélecteur ne peut pas être vide'
				hasErrors = true
			} else if (!validateSelector(sel.selector)) {
				errors[sel.id] = 'Sélecteur CSS invalide'
				hasErrors = true
			}
		}

		if (hasErrors) {
			setValidationErrors(errors)
			return
		}

		// Get existing config to preserve authConfig
		const existingConfig = await getSelectorConfig(feedId)

		// Save configuration
		const config: FeedSelectorConfig = {
			feedId,
			selectors: selectors.filter((s) => s.selector.trim()),
			customCss: customCss.trim() || undefined,
			authConfig: existingConfig?.authConfig,
			updatedAt: new Date().toISOString(),
		}

		await setSelectorConfig(feedId, config)
		onConfigSaved?.(config.selectors.length > 0 || !!config.customCss)
		onOpenChange(false)
	}

	const handleCancel = () => {
		setValidationErrors({})
		onOpenChange(false)
	}

	const handleAuthConfigSaved = (hasAuth: boolean) => {
		// Reload auth config to get updated state
		loadAuthConfig()
		onAuthConfigSaved?.(hasAuth)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden p-0">
				<DialogHeader className="px-6 pt-6 pb-2">
					<DialogTitle>Configure feed</DialogTitle>
					<DialogDescription>
						Settings for <span className="font-semibold">{feedTitle || 'this feed'}</span>
					</DialogDescription>
					{feedUrl && (
						<p className="text-xs text-muted-foreground mt-1">
							<span className="font-medium">URL</span>{' '}
							<button
								type="button"
								className="underline hover:text-foreground transition-colors cursor-pointer break-all text-left"
								onClick={async () => {
									try {
										const mod = await import('@tauri-apps/plugin-shell')
										if (typeof mod.open === 'function') {
											await mod.open(feedUrl)
										} else {
											window.open(feedUrl, '_blank', 'noopener,noreferrer')
										}
									} catch {
										window.open(feedUrl, '_blank', 'noopener,noreferrer')
									}
								}}
							>
								{feedUrl}
							</button>
						</p>
					)}
				</DialogHeader>

				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="flex-1 flex flex-col min-h-0"
				>
					<div className="px-6">
						<TabsList className="w-full">
							<TabsTrigger value="extraction" className="flex-1">Content extraction</TabsTrigger>
							<TabsTrigger value="auth" className="flex-1">Authentication</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent
						value="extraction"
						className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-6 data-[state=inactive]:hidden"
					>
						<Card className="flex-1 flex flex-col min-h-0 border-0 shadow-none p-4">
							<CardHeader className="px-0 pt-4 pb-2">
								<CardTitle className="text-base">CSS Selectors</CardTitle>
								<CardDescription>
									Define CSS selectors to extract or exclude content from articles.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex-1 min-h-0 overflow-y-auto px-0" style={{ maxHeight: '35vh' }}>
								<div className="space-y-3">
									{isLoading ? (
										<div className="text-center py-4 text-muted-foreground">Loading...</div>
									) : selectors.length === 0 ? (
										<div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
											No selector configured yet.<br />
											Click "Add" to get started.
										</div>
									) : (
										selectors.map((sel, index) => (
											<SelectorRow
												key={sel.id}
												selector={sel}
												index={index}
												total={selectors.length}
												error={validationErrors[sel.id]}
												onToggleOperation={() => toggleOperation(sel.id)}
												onUpdateSelector={(value) => updateSelector(sel.id, { selector: value })}
												onRemove={() => removeSelector(sel.id)}
												onMoveUp={() => index > 0 && moveSelector(index, index - 1)}
												onMoveDown={() =>
													index < selectors.length - 1 && moveSelector(index, index + 1)
												}
											/>
										))
									)}

									{/* Custom CSS section */}
									{!isLoading && (
										<div className="pt-4 border-t mt-4 grid gap-3">
											<Label htmlFor="custom-css">Custom CSS (optional)</Label>
											<Textarea
												id="custom-css"
												value={customCss}
												onChange={(e) => setCustomCss(e.target.value)}
												placeholder={`/* Examples */
img { max-width: 100%; }
.ad, .sidebar { display: none; }
p { line-height: 1.8; }`}
												className="font-mono text-sm min-h-[80px] resize-y"
												spellCheck={false}
											/>
										</div>
									)}
								</div>
							</CardContent>
							<CardFooter className="flex justify-between items-center px-0 pt-4 border-t">
								<Button variant="outline" size="sm" onClick={addSelector}>
									<IconPlus className="h-4 w-4 mr-1" />
									Add selector
								</Button>
								<div className="flex gap-2">
									<Button variant="outline" onClick={handleCancel}>
										Cancel
									</Button>
									<Button onClick={handleSaveSelectors}>Save</Button>
								</div>
							</CardFooter>
						</Card>
					</TabsContent>

					<TabsContent
						value="auth"
						className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-6 data-[state=inactive]:hidden"
					>
						<Card className="flex-1 flex flex-col min-h-0 border-0 shadow-none p-4">
							<CardHeader className="px-0 pt-4 pb-2">
								<CardTitle className="text-base">Site authentication</CardTitle>
								<CardDescription>
									Configure credentials to access subscriber-only content.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex-1 min-h-0 overflow-y-auto px-0" style={{ maxHeight: '45vh' }}>
								<AuthConfigTab
									feedId={feedId}
									initialConfig={authConfig}
									onConfigSaved={handleAuthConfigSaved}
								/>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}

interface SelectorRowProps {
	selector: SelectorItem
	index: number
	total: number
	error?: string
	onToggleOperation: () => void
	onUpdateSelector: (value: string) => void
	onRemove: () => void
	onMoveUp: () => void
	onMoveDown: () => void
}

function SelectorRow({
	selector,
	index,
	total,
	error,
	onToggleOperation,
	onUpdateSelector,
	onRemove,
	onMoveUp,
	onMoveDown,
}: SelectorRowProps) {
	return (
		<div className="flex items-center gap-2 p-3 rounded-lg border bg-card">
			{/* Reorder buttons */}
			<div className="flex flex-col gap-0.5">
				<Button
					variant="ghost"
					size="icon"
					className="h-5 w-5"
					onClick={onMoveUp}
					disabled={index === 0}
				>
					<IconChevronUp className="h-3 w-3" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="h-5 w-5"
					onClick={onMoveDown}
					disabled={index === total - 1}
				>
					<IconChevronDown className="h-3 w-3" />
				</Button>
			</div>

			{/* Operation toggle (+/-) */}
			<Button
				variant={selector.operation === '+' ? 'default' : 'destructive'}
				size="icon"
				className="h-8 w-8 flex-shrink-0"
				onClick={onToggleOperation}
				title={
					selector.operation === '+'
						? 'Include (click to exclude)'
						: 'Exclude (click to include)'
				}
			>
				{selector.operation === '+' ? (
					<IconPlus className="h-4 w-4" />
				) : (
					<IconMinus className="h-4 w-4" />
				)}
			</Button>

			{/* Selector input */}
			<div className="flex-1">
				<Input
					value={selector.selector}
					onChange={(e) => onUpdateSelector(e.target.value)}
					placeholder="e.g. article, .content, #main"
					className={error ? 'border-destructive' : ''}
				/>
				{error && <p className="text-xs text-destructive mt-1">{error}</p>}
			</div>

			{/* Remove button */}
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8 text-muted-foreground hover:text-destructive"
				onClick={onRemove}
			>
				<IconTrash className="h-4 w-4" />
			</Button>
		</div>
	)
}
