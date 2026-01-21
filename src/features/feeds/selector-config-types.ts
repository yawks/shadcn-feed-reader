/**
 * Configuration for a single CSS selector
 */
export interface SelectorItem {
  /** Unique identifier for the selector */
  id: string
  /** The CSS selector string (e.g., "article", ".content", "#main-text") */
  selector: string
  /** Operation: '+' includes matching elements, '-' excludes them */
  operation: '+' | '-'
  /** Display order (0-based) */
  order: number
}

/**
 * Extra form field for authentication (beyond username/password)
 * If value is empty, the field value will be fetched dynamically from the login form
 * (useful for CSRF tokens and other dynamic fields)
 */
export interface AuthExtraField {
  /** Field name in the form */
  name: string
  /** Field value - if empty, will be fetched dynamically from the login form */
  value: string
}

/**
 * Encrypted password storage format
 */
export interface EncryptedAuthConfig {
  /** Encrypted password (base64 encoded) */
  encryptedPassword: string
  /** IV used for encryption (base64 encoded) */
  iv: string
  /** Salt used for key derivation (base64 encoded) */
  salt: string
}

/**
 * Authentication configuration for a feed's website
 */
export interface FeedAuthConfig {
  /** URL to POST login form to */
  loginUrl: string
  /** Form field name for username (default: "username") */
  usernameField: string
  /** Form field name for password (default: "password") */
  passwordField: string
  /** User's login/username value */
  username: string
  /** User's password value (only present when decrypted) */
  password: string
  /** Additional form fields required for login (e.g., CSRF token) */
  extraFields?: AuthExtraField[]
  /** CSS selector to extract text from login response (e.g., ".welcome-message", "#user-name") */
  responseSelector?: string
  /** Optional URL to GET after fetching content, to logout from the session */
  logoutUrl?: string
}

/**
 * Auth config as stored (with encrypted password)
 */
export interface StoredAuthConfig extends Omit<FeedAuthConfig, 'password'> {
  /** Encrypted password data */
  encrypted: EncryptedAuthConfig
}

/**
 * Configuration for all selectors of a single feed
 */
export interface FeedSelectorConfig {
  /** Feed ID */
  feedId: string
  /** Ordered list of selectors */
  selectors: SelectorItem[]
  /** Custom CSS to apply to the extracted content */
  customCss?: string
  /** Authentication configuration for the feed's website (password encrypted at rest) */
  authConfig?: StoredAuthConfig
  /** When the configuration was last modified */
  updatedAt: string
}

/**
 * Storage structure for all feed selector configurations
 */
export interface SelectorConfigStorage {
  [feedId: string]: FeedSelectorConfig
}
