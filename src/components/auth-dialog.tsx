import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface AuthDialogProps {
	open: boolean
	domain: string
	onSubmit: (username: string, password: string) => void
	onCancel: () => void
}

export function AuthDialog({ open, domain, onSubmit, onCancel }: AuthDialogProps) {
	const { t } = useTranslation()
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (username && password) {
			onSubmit(username, password)
			setUsername('')
			setPassword('')
		}
	}

	const handleCancel = () => {
		setUsername('')
		setPassword('')
		onCancel()
	}

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>{t('auth_dialog.title')}</DialogTitle>
					<DialogDescription>
						{t('auth_dialog.description_part1')} <span className="font-mono text-sm">{domain}</span> {t('auth_dialog.description_part2')}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
							<Label htmlFor="username" className="sm:text-right">
								{t('auth_dialog.username')}
							</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								className="sm:col-span-3"
								autoFocus
								autoComplete="username"
							/>
						</div>
						<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
							<Label htmlFor="password" className="sm:text-right">
								{t('auth_dialog.password')}
							</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="sm:col-span-3"
								autoComplete="current-password"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleCancel}>
							{t('auth_dialog.cancel')}
						</Button>
						<Button type="submit" disabled={!username || !password}>
							{t('auth_dialog.sign_in')}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
