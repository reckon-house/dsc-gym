// The one place the signing secret is read.
//
// Ten files used to do `process.env.JWT_SECRET || 'fallback-secret-change-in-
// production'` independently. That fallback is exactly the wrong shape: if the
// env var ever went missing in production, every session token in the app
// would silently become forgeable by anyone who read the source, and nothing
// would fail to tell us. A missing secret should refuse to boot, not quietly
// downgrade to a known string.
//
// Kept dependency-free so middleware (edge runtime) can import it.

function readJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (s && s.length >= 16) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is not set (or is under 16 characters). Refusing to start with a forgeable session secret.'
    )
  }
  // Local dev only. Obviously insecure, and obviously labelled as such.
  return 'dev-only-insecure-secret-do-not-deploy'
}

export const JWT_SECRET_RAW = readJwtSecret()
