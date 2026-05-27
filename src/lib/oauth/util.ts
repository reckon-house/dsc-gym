// OAuth 2.1 helpers — token generation, PKCE verification, base URL.

import crypto from 'crypto'

// Cryptographically-random opaque token (~32 bytes encoded → 43 chars).
export function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

// PKCE S256 verification per RFC 7636: SHA-256(verifier) base64url-encoded
// (no padding) must equal the challenge the client submitted on /authorize.
export function verifyPkceS256(
  codeVerifier: string,
  codeChallenge: string
): boolean {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(codeChallenge))
}

// Returns the canonical public base URL of this deployment.
// In prod: https://dsc-gym.vercel.app (from PUBLIC_URL or VERCEL_URL).
// In dev: http://localhost:3000 (or what the request says).
export function publicBaseUrl(reqOrigin?: string | null): string {
  if (process.env.OAUTH_PUBLIC_URL) return process.env.OAUTH_PUBLIC_URL
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (reqOrigin) return reqOrigin
  return 'http://localhost:3000'
}

// Validate that a redirect_uri matches at least one registered URI for
// a client. Exact match — no wildcards, no path-prefix games.
export function isAllowedRedirectUri(
  redirectUri: string,
  registered: string[]
): boolean {
  return registered.includes(redirectUri)
}

// 24h access token. Originally 1h (RFC suggests "short-lived"), but
// in practice that meant ~24 chances per day for the connector's
// auto-refresh to hiccup and silently disconnect on the client side.
// The refresh token rotation still happens; we just don't need a fresh
// access token every hour.
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 // 24h
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30d
export const AUTH_CODE_TTL_SECONDS = 90 // 90s
