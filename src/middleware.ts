import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

// Routes that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/checkin',
  '/athlete',
  '/api/auth/login',
  '/api/checkin',
  '/api/athletes/register',
]

// Routes only accessible by specific roles
const ADMIN_PATHS = ['/admin', '/api/trainers']
const TRAINER_PATHS = ['/trainer']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Check for session token
  const token = request.cookies.get('session')?.value

  if (!token) {
    // Redirect to login for page requests
    if (!pathname.startsWith('/api')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Return 401 for API requests
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    const role = payload.role as string

    // Check role-based access
    if (ADMIN_PATHS.some((p) => pathname.startsWith(p)) && role !== 'ADMIN') {
      if (!pathname.startsWith('/api')) {
        return NextResponse.redirect(new URL('/trainer', request.url))
      }
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    if (TRAINER_PATHS.some((p) => pathname.startsWith(p)) && role === 'ADMIN') {
      if (!pathname.startsWith('/api')) {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
    }

    // Add user info to headers for API routes
    const response = NextResponse.next()
    response.headers.set('x-user-id', payload.userId as string)
    response.headers.set('x-user-role', role)
    if (payload.trainerId) {
      response.headers.set('x-trainer-id', payload.trainerId as string)
    }

    return response
  } catch {
    // Invalid token - clear it and redirect to login
    const response = pathname.startsWith('/api')
      ? NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        )
      : NextResponse.redirect(new URL('/login', request.url))

    response.cookies.delete('session')
    return response
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
