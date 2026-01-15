import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from './db'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

export interface SessionUser {
  userId: string
  email: string
  name: string
  role: 'ADMIN' | 'TRAINER'
  trainerId?: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSession(user: {
  id: string
  email: string
  name: string
  role: string
  trainer?: { id: string } | null
}): Promise<string> {
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    trainerId: user.trainer?.id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  })

  return token
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}

export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; user?: SessionUser; error?: string }> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { trainer: true },
  })

  if (!user) {
    return { success: false, error: 'Invalid credentials' }
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return { success: false, error: 'Invalid credentials' }
  }

  await createSession(user)

  return {
    success: true,
    user: {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'ADMIN' | 'TRAINER',
      trainerId: user.trainer?.id,
    },
  }
}

export async function requireAuth(
  allowedRoles?: ('ADMIN' | 'TRAINER')[]
): Promise<SessionUser> {
  const session = await getSession()

  if (!session) {
    throw new Error('Unauthorized')
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new Error('Forbidden')
  }

  return session
}
