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

interface AuthDialogProps {
	open: boolean
	domain: string
	onSubmit: (username: string, password: string) => void
	onCancel: () => void
}

export function AuthDialog({ open, domain, onSubmit, onCancel }: AuthDialogProps) {
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
					<DialogTitle>Authentication Required</DialogTitle>
					<DialogDescription>
						The site <span className="font-mono text-sm">{domain}</span> requires authentication.
						Please enter your username and password.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
							<Label htmlFor="username" className="sm:text-right">
								Username
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
								Password
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
							Cancel
						</Button>
						<Button type="submit" disabled={!username || !password}>
							Sign In
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
