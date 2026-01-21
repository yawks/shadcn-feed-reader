/**
 * Encryption utilities using SubtleCrypto API
 * Uses PBKDF2 for key derivation and AES-GCM for encryption
 */

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16
const IV_LENGTH = 12
const KEY_LENGTH = 256

/**
 * Derive encryption key from master password using PBKDF2
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/**
 * Encrypt plaintext using AES-GCM
 * @returns Object with encrypted password, IV, and salt (all base64 encoded)
 */
export async function encryptPassword(
  plaintext: string,
  masterPassword: string
): Promise<{ encryptedPassword: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(masterPassword, salt)

  const encoder = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )

  return {
    encryptedPassword: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    iv: uint8ArrayToBase64(iv),
    salt: uint8ArrayToBase64(salt),
  }
}

/**
 * Decrypt ciphertext using AES-GCM
 * @returns Decrypted plaintext
 */
export async function decryptPassword(
  encryptedPassword: string,
  iv: string,
  salt: string,
  masterPassword: string
): Promise<string> {
  const saltBytes = base64ToUint8Array(salt)
  const ivBytes = base64ToUint8Array(iv)
  const ciphertext = base64ToUint8Array(encryptedPassword)

  const key = await deriveKey(masterPassword, saltBytes)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}

/**
 * Get the backend password from localStorage
 * This is used as the master password for encrypting feed auth credentials
 */
export function getBackendPassword(): string | null {
  return localStorage.getItem('backend-password')
}
