// /oauth/authorize — the consent page.
//
// Flow:
// 1. Claude.ai sends athlete here with: client_id, redirect_uri,
//    response_type=code, code_challenge, code_challenge_method=S256,
//    scope, state.
// 2. We confirm the athlete is logged in via athleteSession cookie. If
//    not, redirect to /athlete/login?returnTo=<here>.
// 3. Show "Claude wants to access your DSC schedule" with Approve / Deny.
// 4. On approve: POST to /oauth/authorize/grant, which issues a code
//    and redirects back to redirect_uri with code + state.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import Image from 'next/image'
import { db } from '@/lib/db'
import { isAllowedRedirectUri } from '@/lib/oauth/util'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

interface PageProps {
  searchParams: Promise<{
    response_type?: string
    client_id?: string
    redirect_uri?: string
    code_challenge?: string
    code_challenge_method?: string
    state?: string
    scope?: string
  }>
}

export default async function AuthorizePage({ searchParams }: PageProps) {
  const params = await searchParams

  // ----- Param validation -----
  if (params.response_type !== 'code') {
    return <ErrorScreen title="Unsupported response_type" body="Only response_type=code is supported." />
  }
  if (!params.client_id) {
    return <ErrorScreen title="Missing client_id" body="The connector didn't tell us who it is." />
  }
  if (!params.redirect_uri) {
    return <ErrorScreen title="Missing redirect_uri" body="The connector didn't send a redirect URL." />
  }
  if (!params.code_challenge || params.code_challenge_method !== 'S256') {
    return <ErrorScreen title="PKCE required" body="This server requires PKCE with code_challenge_method=S256." />
  }

  const client = await db.oAuthClient.findUnique({
    where: { clientId: params.client_id },
  })
  if (!client) {
    return <ErrorScreen title="Unknown client" body="That connector isn't registered with DSC." />
  }
  if (!isAllowedRedirectUri(params.redirect_uri, client.redirectUris)) {
    return (
      <ErrorScreen
        title="redirect_uri mismatch"
        body="The connector's redirect URL doesn't match what was registered. This is a security check."
      />
    )
  }

  // ----- Auth check -----
  const cookieStore = await cookies()
  const token = cookieStore.get('athleteSession')?.value
  let athleteId: string | null = null
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      if (payload.role === 'ATHLETE' && payload.athleteId) {
        athleteId = payload.athleteId as string
      }
    } catch {
      // fall through; treat as not logged in
    }
  }
  if (!athleteId) {
    // Send athlete to log in, with returnTo that round-trips them back here.
    const here = new URL('/oauth/authorize', 'https://placeholder')
    Object.entries(params).forEach(([k, v]) => {
      if (typeof v === 'string') here.searchParams.set(k, v)
    })
    const returnPath = `${here.pathname}${here.search}`
    redirect(`/athlete/login?returnTo=${encodeURIComponent(returnPath)}`)
  }

  // ----- Load athlete for the consent screen -----
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { firstName: true, lastName: true, email: true, archived: true },
  })
  if (!athlete || athlete.archived) {
    return <ErrorScreen title="Account inactive" body="Your DSC account is inactive. Contact the gym." />
  }

  const appName = client.name?.trim() || 'A connected app'

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 md:px-6 py-5 flex items-center">
        <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="dsc-label text-black/40 mb-2">Authorize access</div>
          <h1 className="dsc-headline text-3xl md:text-4xl text-black mb-6 leading-[0.95]">
            {appName}
            <br />
            wants to connect.
          </h1>

          <div className="rounded-3xl bg-black/[0.04] p-5 mb-6 space-y-4">
            <div>
              <div className="dsc-label text-black/50 mb-1">Signed in as</div>
              <div className="text-black">
                {athlete.firstName} {athlete.lastName}
                <span className="text-black/50"> · {athlete.email}</span>
              </div>
            </div>
            <div>
              <div className="dsc-label text-black/50 mb-1">What this lets it do</div>
              <ul className="text-sm text-black/80 list-disc list-inside space-y-1">
                <li>See your upcoming sessions</li>
                <li>Check your trainer&rsquo;s availability</li>
                <li>Send booking requests on your behalf (you still confirm)</li>
                <li>Cancel your own sessions</li>
              </ul>
            </div>
            <div className="dsc-label text-black/40">
              Access can be revoked anytime from your DSC dashboard.
            </div>
          </div>

          <form action="/oauth/authorize/grant" method="POST" className="space-y-2">
            <input type="hidden" name="client_id" value={params.client_id} />
            <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
            <input type="hidden" name="code_challenge" value={params.code_challenge} />
            <input
              type="hidden"
              name="code_challenge_method"
              value={params.code_challenge_method}
            />
            <input type="hidden" name="state" value={params.state ?? ''} />
            <input type="hidden" name="scope" value={params.scope ?? 'mcp'} />

            <button
              type="submit"
              name="decision"
              value="approve"
              className="w-full h-12 bg-black text-white rounded-full dsc-headline text-base"
            >
              Approve
            </button>
            <button
              type="submit"
              name="decision"
              value="deny"
              className="w-full h-12 text-black/60 rounded-full text-sm"
            >
              Deny
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 md:px-6 py-5 flex items-center">
        <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="dsc-label text-red-700 mb-2">Can&rsquo;t connect</div>
          <h2 className="dsc-headline text-3xl text-black mb-3">{title}</h2>
          <p className="text-black/70">{body}</p>
        </div>
      </main>
    </div>
  )
}
