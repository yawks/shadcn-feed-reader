import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconEye, IconEyeOff } from '@tabler/icons-react'
import type { FeedAuthConfig, AuthExtraField } from './selector-config-types'
import { setAuthConfig, removeAuthConfig, getAuthConfig } from '@/lib/selector-config-storage'
import { safeInvoke } from '@/lib/safe-invoke'
import { toast } from 'sonner'

interface AuthConfigTabProps {
	feedId: string
	initialConfig: FeedAuthConfig | null
	onConfigSaved?: (hasAuth: boolean) => void
}

export function AuthConfigTab({ feedId, initialConfig, onConfigSaved }: AuthConfigTabProps) {
	const { t } = useTranslation()
	const [loginUrl, setLoginUrl] = useState(initialConfig?.loginUrl || '')
	const [usernameField, setUsernameField] = useState(initialConfig?.usernameField || 'username')
	const [passwordField, setPasswordField] = useState(initialConfig?.passwordField || 'password')
	const [username, setUsername] = useState(initialConfig?.username || '')
	const [password, setPassword] = useState(initialConfig?.password || '')
	const [extraFields, setExtraFields] = useState<AuthExtraField[]>(initialConfig?.extraFields || [])
	const [responseSelector, setResponseSelector] = useState(initialConfig?.responseSelector || '')
	const [logoutUrl, setLogoutUrl] = useState(initialConfig?.logoutUrl || '')
	const [showPassword, setShowPassword] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isLoggingIn, setIsLoggingIn] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const addExtraField = () => {
		setExtraFields([...extraFields, { name: '', value: '' }])
	}

	const removeExtraField = (index: number) => {
		setExtraFields(extraFields.filter((_, i) => i !== index))
	}

	const updateExtraField = (index: number, field: Partial<AuthExtraField>) => {
		setExtraFields(extraFields.map((f, i) => (i === index ? { ...f, ...field } : f)))
	}

	const handleSave = async () => {
		if (!loginUrl.trim()) {
			setError(t('auth_config.login_url_required'))
			return
		}

		// Validate URL
		try {
			new URL(loginUrl)
		} catch {
			setError(t('auth_config.login_url_invalid'))
			return
		}

		if (!username.trim()) {
			setError(t('auth_config.username_required'))
			return
		}

		if (!password) {
			setError(t('auth_config.password_required'))
			return
		}

		setError(null)
		setIsSaving(true)

		try {
			const config: FeedAuthConfig = {
				loginUrl: loginUrl.trim(),
				usernameField: usernameField.trim() || 'username',
				passwordField: passwordField.trim() || 'password',
				username: username.trim(),
				password,
				extraFields: extraFields.filter((f) => f.name.trim()),
				responseSelector: responseSelector.trim() || undefined,
				logoutUrl: logoutUrl.trim() || undefined,
			}
			await setAuthConfig(feedId, config)
			onConfigSaved?.(true)
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error('[AuthConfigTab] Failed to save auth config:', e)
			setError(e instanceof Error ? e.message : t('auth_config.save_error'))
		} finally {
			setIsSaving(false)
		}
	}

	const handleRemove = async () => {
		setIsSaving(true)
		setError(null)

		try {
			await removeAuthConfig(feedId)
			onConfigSaved?.(false)
			// Reset form
			setLoginUrl('')
			setUsernameField('username')
			setPasswordField('password')
			setUsername('')
			setPassword('')
			setExtraFields([])
			setResponseSelector('')
			setLogoutUrl('')
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error('[AuthConfigTab] Failed to remove auth config:', e)
			setError(t('auth_config.delete_error'))
		} finally {
			setIsSaving(false)
		}
	}

	const hasExistingConfig = !!initialConfig?.loginUrl

	/**
	 * Fetches the login page and extracts field values from the form
	 * Used to get dynamic values like CSRF tokens
	 */
	const fetchDynamicFieldValues = async (
		pageUrl: string,
		fieldNames: string[]
	): Promise<Map<string, string>> => {
		const values = new Map<string, string>()
		if (fieldNames.length === 0) return values

		// eslint-disable-next-line no-console
		console.log('[AuthConfigTab] Fetching dynamic field values for:', fieldNames)

		try {
			let html: string | null = null
			try {
				html = (await safeInvoke('fetch_raw_html', { url: pageUrl })) as string
			} catch {
				// safeInvoke failed, html remains null
			}

			if (html) {
				// Parse HTML and extract form field values
				const parser = new DOMParser()
				const doc = parser.parseFromString(html, 'text/html')

				for (const fieldName of fieldNames) {
					// Try to find input with this name
					const input = doc.querySelector(
						`input[name="${fieldName}"], textarea[name="${fieldName}"], select[name="${fieldName}"]`
					) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
					if (input) {
						const value = input.value || input.getAttribute('value') || ''
						values.set(fieldName, value)
						// eslint-disable-next-line no-console
						console.log(`[AuthConfigTab] Found dynamic value for "${fieldName}":`, value ? '[hidden]' : '(empty)')
					} else {
						// eslint-disable-next-line no-console
						console.warn(`[AuthConfigTab] Field "${fieldName}" not found in form`)
					}
				}
			}
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error('[AuthConfigTab] Error fetching dynamic field values:', err)
		}

		return values
	}

	const handleLogin = async () => {
		// Use saved config if available, otherwise use current form values
		const authConfig = await getAuthConfig(feedId)
		const configToUse = authConfig || {
			loginUrl: loginUrl.trim(),
			usernameField: usernameField.trim() || 'username',
			passwordField: passwordField.trim() || 'password',
			username: username.trim(),
			password,
			extraFields: extraFields.filter((f) => f.name.trim()),
			responseSelector: responseSelector.trim() || undefined,
		}

		if (!configToUse.loginUrl) {
			toast.error(t('auth_config.login_url_required'))
			return
		}

		if (!configToUse.username || !configToUse.password) {
			toast.error(t('auth_config.credentials_required'))
			return
		}

		setIsLoggingIn(true)
		toast.info(t('auth_config.logging_in'))

		try {
			// Find fields that need dynamic values (empty value)
			const dynamicFieldNames = (configToUse.extraFields || [])
				.filter((f) => f.name.trim() && !f.value.trim())
				.map((f) => f.name.trim())

			// Fetch dynamic values if needed
			let dynamicValues = new Map<string, string>()
			if (dynamicFieldNames.length > 0) {
				toast.info(t('auth_config.fetching_dynamic_values'))
				dynamicValues = await fetchDynamicFieldValues(configToUse.loginUrl, dynamicFieldNames)
			}

			// Build final fields list, replacing empty values with dynamic ones
			const resolvedExtraFields = (configToUse.extraFields || [])
				.filter((f) => f.name.trim())
				.map((f) => ({
					name: f.name.trim(),
					value: f.value.trim() || dynamicValues.get(f.name.trim()) || '',
				}))

			const fields = [
				{ name: configToUse.usernameField, value: configToUse.username },
				{ name: configToUse.passwordField, value: configToUse.password },
				...resolvedExtraFields,
			]

			// Try Tauri (desktop) or HTTP API (Docker/Web mode) via safeInvoke
			const result = (await safeInvoke('perform_form_login', {
				request: {
					login_url: configToUse.loginUrl,
					fields,
					response_selector: configToUse.responseSelector,
				},
			})) as { success?: boolean; message?: string; extracted_text?: string }

			if (result?.success) {
				if (result.extracted_text) {
					toast.success(t('auth_config.login_success_with_text', { text: result.extracted_text }))
				} else {
					toast.success(t('auth_config.login_success'))
				}
			} else {
				toast.error(result?.message || t('auth_config.login_fail'))
			}
		} catch (err) {
			toast.error(t('auth_config.login_fail_with_error', { message: err instanceof Error ? err.message : String(err) }))
		} finally {
			setIsLoggingIn(false)
		}
	}

	return (
		<div className="space-y-4 py-4">
			<p className="text-sm text-muted-foreground">
				{t('auth_config.description')}
			</p>

			{/* Login URL */}
			<div className="space-y-2">
				<Label htmlFor="loginUrl">{t('auth_config.login_url')}</Label>
				<Input
					id="loginUrl"
					value={loginUrl}
					onChange={(e) => setLoginUrl(e.target.value)}
					placeholder="https://example.com/login"
				/>
				<p className="text-xs text-muted-foreground">
					{t('auth_config.login_url_help')}
				</p>
			</div>

			{/* Field names */}
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="usernameField">{t('auth_config.username_field')}</Label>
					<Input
						id="usernameField"
						value={usernameField}
						onChange={(e) => setUsernameField(e.target.value)}
						placeholder="username"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="passwordField">{t('auth_config.password_field')}</Label>
					<Input
						id="passwordField"
						value={passwordField}
						onChange={(e) => setPasswordField(e.target.value)}
						placeholder="password"
					/>
				</div>
			</div>

			{/* Credentials */}
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="username">{t('auth_config.username')}</Label>
					<Input
						id="username"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						placeholder="votre@email.com"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="password">{t('auth_config.password')}</Label>
					<div className="relative">
						<Input
							id="password"
							type={showPassword ? 'text' : 'password'}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="pr-10"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="absolute right-0 top-0 h-full px-3"
							onClick={() => setShowPassword(!showPassword)}
						>
							{showPassword ? (
								<IconEyeOff className="h-4 w-4" />
							) : (
								<IconEye className="h-4 w-4" />
							)}
						</Button>
					</div>
				</div>
			</div>

			{/* Extra fields section */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label>{t('auth_config.extra_fields')}</Label>
					<Button variant="outline" size="sm" onClick={addExtraField}>
						<IconPlus className="h-4 w-4 mr-1" />
						{t('auth_config.add')}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					{t('auth_config.extra_fields_help')}
				</p>
				{extraFields.map((field, index) => (
					<div key={index} className="flex gap-2">
						<Input
							placeholder={t('auth_config.field_name_placeholder')}
							value={field.name}
							onChange={(e) => updateExtraField(index, { name: e.target.value })}
							className="flex-1"
						/>
						<Input
							placeholder={t('auth_config.field_value_placeholder')}
							value={field.value}
							onChange={(e) => updateExtraField(index, { value: e.target.value })}
							className="flex-1"
						/>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => removeExtraField(index)}
							className="text-muted-foreground hover:text-destructive"
						>
							<IconTrash className="h-4 w-4" />
						</Button>
					</div>
				))}
			</div>

			{/* Response selector */}
			<div className="space-y-2">
				<Label htmlFor="responseSelector">{t('auth_config.response_selector')}</Label>
				<Input
					id="responseSelector"
					value={responseSelector}
					onChange={(e) => setResponseSelector(e.target.value)}
					placeholder=".welcome-message, #user-name"
				/>
				<p className="text-xs text-muted-foreground">
					{t('auth_config.response_selector_help')}
				</p>
			</div>

			{/* Logout URL */}
			<div className="space-y-2">
				<Label htmlFor="logoutUrl">{t('auth_config.logout_url')}</Label>
				<Input
					id="logoutUrl"
					value={logoutUrl}
					onChange={(e) => setLogoutUrl(e.target.value)}
					placeholder="https://example.com/logout"
				/>
				<p className="text-xs text-muted-foreground">
					{t('auth_config.logout_url_help')}
				</p>
			</div>

			{/* Error message */}
			{error && <p className="text-sm text-red-500">{error}</p>}

			{/* Action buttons */}
			<div className="flex gap-2 pt-4 border-t">
				<Button onClick={handleSave} disabled={isSaving || isLoggingIn}>
					{isSaving ? t('auth_config.saving') : t('auth_config.save')}
				</Button>
				<Button variant="secondary" onClick={handleLogin} disabled={isSaving || isLoggingIn}>
					{isLoggingIn ? t('auth_config.logging_in_button') : t('auth_config.login')}
				</Button>
				{hasExistingConfig && (
					<Button variant="destructive" onClick={handleRemove} disabled={isSaving || isLoggingIn}>
						{t('auth_config.delete')}
					</Button>
				)}
			</div>
		</div>
	)
}
