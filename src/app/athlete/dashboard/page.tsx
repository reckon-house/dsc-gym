'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface UpcomingSession {
  id: string
  scheduledAt: string
  duration: number
  trainerName: string
}

interface BookingRequest {
  id: string
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  scheduledAt: string
  localTime: string
  duration: number
  trainerName: string
  notes: string | null
  declineReason: string | null
  resolvedAt: string | null
  source: string
}

interface AthleteSession {
  id: string
  name: string
  email: string
}

interface TrainerProfile {
  id: string
  name: string
  title: string | null
  bio: string | null
  specialties: string[]
  certifications: string[]
  education: string | null
  photoUrl: string | null
}

interface ServiceEntry {
  slug: string
  name: string
  summary: string
}

interface GymOverview {
  name: string
  tagline: string | null
  mission: string | null
  about: string | null
  hours: { summary?: string } | null
  locations: { name: string; city: string; state: string; comingSoon?: boolean }[] | null
  contact: { email?: string; phone?: string; website?: string } | null
  services: ServiceEntry[] | null
  facilities: string | null
  // Canonical, publicly-reachable URL of the MCP server. Server-side
  // computed so it's always correct even when the dashboard is being
  // viewed on localhost.
  mcpUrl: string
}

interface ConnectionStatus {
  connected: boolean
  lastUsedAt: string | null
  firstConnectedAt: string | null
  clientNames: string[]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function AthleteDashboard() {
  const router = useRouter()
  const [athlete, setAthlete] = useState<AthleteSession | null>(null)
  const [sessions, setSessions] = useState<UpcomingSession[]>([])
  const [requests, setRequests] = useState<BookingRequest[]>([])
  const [gymOverview, setGymOverview] = useState<GymOverview | null>(null)
  const [trainers, setTrainers] = useState<TrainerProfile[]>([])
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/athletes/auth')
      const d = await r.json()
      if (!d.success) {
        router.replace('/athlete/login')
        return
      }
      setAthlete(d.athlete)
      const [sRes, rRes, gRes, cRes] = await Promise.all([
        fetch('/api/athletes/me/sessions'),
        fetch('/api/athletes/me/requests'),
        fetch('/api/gym/overview'),
        fetch('/api/athletes/me/connection-status'),
      ])
      const sData = await sRes.json()
      if (sData.success) setSessions(sData.data)
      const rData = await rRes.json()
      if (rData.success) setRequests(rData.data)
      const gData = await gRes.json()
      if (gData.success) {
        setGymOverview(gData.data.gym)
        setTrainers(gData.data.trainers)
      }
      const cData = await cRes.json()
      if (cData.success) setConnection(cData.data)
      setLoading(false)
    })()
  }, [router])

  async function handleLogout() {
    await fetch('/api/athletes/auth', { method: 'DELETE' })
    router.push('/athlete/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="dsc-label text-black/50">Loading…</div>
      </div>
    )
  }

  const today = new Date()
  const nextSession = sessions[0]
  const todaySessions = sessions.filter((s) => isSameDay(new Date(s.scheduledAt), today))
  const upcoming = sessions.filter((s) => !isSameDay(new Date(s.scheduledAt), today))

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 py-5 flex items-center justify-between">
        <Link href="/athlete" aria-label="DSC home" className="block">
          <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
        </Link>
        <button
          onClick={handleLogout}
          className="dsc-label text-black/60 hover:text-black"
        >
          Log out
        </button>
      </header>

      <div className="px-4 py-2 max-w-2xl mx-auto w-full flex-1">
        {/* Hero greeting */}
        <div className="mb-8">
          <div className="dsc-label text-black/40 mb-1">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <h1 className="dsc-headline text-4xl md:text-5xl text-black">
            {athlete?.name?.split(' ')[0] || 'Athlete'}
          </h1>
        </div>

        {/* Next-up card */}
        {nextSession && !todaySessions.length && (
          <div className="rounded-3xl bg-black text-white p-6 mb-6">
            <div className="dsc-label text-white/60 mb-2">Up next</div>
            <div className="dsc-headline text-3xl text-white mb-1">
              {new Date(nextSession.scheduledAt).toLocaleDateString('en-US', {
                weekday: 'long',
              })}
            </div>
            <div className="text-white/80 font-mono text-sm">
              {new Date(nextSession.scheduledAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              · {nextSession.duration} min · with{' '}
              {nextSession.trainerName.split(' ')[0]}
            </div>
            <div className="text-white/50 text-xs mt-2">
              {new Date(nextSession.scheduledAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        )}

        {todaySessions.length > 0 && (
          <div className="rounded-3xl bg-black text-white p-6 mb-6">
            <div className="dsc-label text-white/60 mb-2">Today</div>
            <div className="space-y-2">
              {todaySessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-baseline justify-between"
                >
                  <div className="dsc-headline text-2xl text-white">
                    {new Date(s.scheduledAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="text-white/70 text-sm">
                    with {s.trainerName.split(' ')[0]} · {s.duration} min
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request status — pending + recent decisions */}
        {requests.length > 0 && <RequestActivity requests={requests} />}

        {/* Upcoming list */}
        <div className="mb-3">
          <div className="dsc-label text-black/50">
            Upcoming · {upcoming.length}
          </div>
        </div>
        {upcoming.length === 0 && !nextSession ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-8 text-center">
            <div className="dsc-label text-black/40 mb-1">No sessions</div>
            <p className="text-sm text-black/60">
              Nothing on the books yet. Reach out to the gym to schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((s) => {
              const d = new Date(s.scheduledAt)
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-black/10 p-4 flex items-center gap-4"
                >
                  <div className="text-center w-12 shrink-0">
                    <div className="dsc-label text-black/40">
                      {DAY_NAMES[d.getDay()]}
                    </div>
                    <div className="dsc-headline text-2xl text-black leading-none">
                      {d.getDate()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-black">
                      {d.toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      · {s.duration} min
                    </div>
                    <div className="text-sm text-black/60 truncate">
                      with {s.trainerName.split(' ')[0]}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Meet the team */}
        {trainers.length > 0 && <TrainersSection trainers={trainers} />}

        {/* What we offer */}
        {gymOverview?.services && gymOverview.services.length > 0 && (
          <ServicesSection services={gymOverview.services} />
        )}

        {/* Connect to AI — MCP */}
        <ConnectToAI
          mcpUrl={gymOverview?.mcpUrl ?? ''}
          status={connection}
        />

        {/* Gym info footer */}
        {gymOverview && <GymInfoFooter overview={gymOverview} />}
      </div>
    </div>
  )
}

function RequestActivity({ requests }: { requests: BookingRequest[] }) {
  const pending = requests.filter((r) => r.status === 'pending')
  const recent = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="mb-6 space-y-3">
      {pending.length > 0 && (
        <div className="rounded-3xl bg-black/[0.04] p-4">
          <div className="dsc-label text-black/50 mb-2">
            Waiting on approval · {pending.length}
          </div>
          <div className="space-y-2">
            {pending.map((r) => (
              <div
                key={r.id}
                className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3"
              >
                <span
                  className="w-2 h-2 rounded-full bg-black/60 shrink-0"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-black">
                    {r.localTime}
                    <span className="text-black/50">
                      {' · '}
                      {r.duration}min with {r.trainerName.split(' ')[0]}
                    </span>
                  </div>
                  {r.source === 'mcp' && (
                    <div className="dsc-label text-black/40 mt-0.5">
                      via AI
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="dsc-label text-black/50 mb-2">Recent activity</div>
          <div className="space-y-2">
            {recent.map((r) => {
              const isApproved = r.status === 'approved'
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-black/10 px-4 py-3 flex items-start gap-3"
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      isApproved ? 'bg-green-600' : 'bg-black/30'
                    }`}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-black">
                      <span className="font-medium">
                        {isApproved ? 'Approved' : 'Declined'}
                      </span>
                      <span className="text-black/50">
                        {' · '}
                        {r.localTime}
                      </span>
                    </div>
                    <div className="text-xs text-black/60 mt-0.5">
                      {r.duration}min with {r.trainerName.split(' ')[0]}
                    </div>
                    {!isApproved && r.declineReason && (
                      <div className="text-xs text-black/70 mt-1 italic">
                        “{r.declineReason}”
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Format "5 minutes ago" / "yesterday" / "3 days ago" from an ISO time.
// Kept narrow — only used inline for the connection-status pill.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return 'just now'
  const min = Math.round(diffSec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day} days ago`
  if (day < 30) return `${Math.round(day / 7)} wk ago`
  return `${Math.round(day / 30)} mo ago`
}

function ConnectionStatusPill({ status }: { status: ConnectionStatus }) {
  if (status.connected) {
    const via = status.clientNames[0] ?? null
    const activity = status.lastUsedAt
      ? `last activity ${relativeTime(status.lastUsedAt)}`
      : 'ready'
    return (
      <div className="rounded-2xl bg-white px-4 py-3 mb-3 flex items-center gap-3">
        <span
          className="w-2 h-2 rounded-full bg-green-600 shrink-0"
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-black">
            <span className="font-medium">Connected</span>
            {via && (
              <span className="text-black/50"> · via {via}</span>
            )}
          </div>
          <div className="text-xs text-black/50">{activity}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-white px-4 py-3 mb-3 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-black/30 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-black">
          <span className="font-medium">Not connected</span>
        </div>
        <div className="text-xs text-black/50">
          {status.firstConnectedAt
            ? `Last connected ${relativeTime(status.firstConnectedAt)}. Re-add the connector below to reconnect.`
            : 'Follow the steps below to connect your AI.'}
        </div>
      </div>
    </div>
  )
}

function ConnectToAI({
  mcpUrl,
  status,
}: {
  mcpUrl: string
  status: ConnectionStatus | null
}) {
  // mcpUrl arrives server-computed via /api/gym/overview, so this is
  // always the publicly-reachable production URL even when the page
  // itself is being served from localhost.

  async function copyUrl() {
    if (!mcpUrl) return
    try {
      await navigator.clipboard.writeText(mcpUrl)
    } catch {
      /* clipboard might be blocked — fallthrough */
    }
  }

  // Default-open the instructions when not connected so the recovery
  // path is one click away.
  const openByDefault = status ? !status.connected : false

  return (
    <div className="mt-8 rounded-3xl bg-black/[0.04] p-5">
      <div className="dsc-label text-black/40 mb-1">Connect to AI</div>
      <h2 className="dsc-headline text-2xl text-black mb-2 leading-tight">
        Schedule by chat.
      </h2>
      <p className="text-sm text-black/70 mb-4">
        Add DSC to <strong className="text-black">Claude.ai</strong>,{' '}
        <strong className="text-black">ChatGPT</strong>, or any MCP-compatible
        client and ask your AI to check your schedule, find a slot with your
        trainer, or request a session. The gym owner still approves any new
        bookings.
      </p>

      {/* Status pill — derived from server-side OAuth token state, not
          the client's connector UI. Shows the athlete the source of
          truth so a stale connector card doesn't make them panic. */}
      {status && <ConnectionStatusPill status={status} />}

      <div className="rounded-2xl bg-white p-3 mb-3">
        <div className="dsc-label text-black/40 mb-1">MCP server URL</div>
        <div className="flex items-center gap-2">
          <code className="text-xs text-black truncate flex-1 font-mono">
            {mcpUrl || '…'}
          </code>
          <button
            onClick={copyUrl}
            className="shrink-0 h-8 px-3 bg-black text-white text-xs rounded-full dsc-headline"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <details className="text-sm text-black/70 group" open={openByDefault}>
          <summary className="cursor-pointer text-black/80 select-none flex items-center gap-2">
            <span className="dsc-label text-black/40 group-open:hidden">+</span>
            <span className="dsc-label text-black/40 hidden group-open:inline">–</span>
            <span>How to add it to Claude.ai</span>
          </summary>
          <ol className="mt-3 pl-5 list-decimal space-y-1.5 text-black/70">
            <li>
              In Claude.ai, open <strong>Settings → Connectors → Add custom connector</strong>.
            </li>
            <li>Paste the MCP URL above.</li>
            <li>
              Claude will redirect you here to sign in and approve access — same
              login you&rsquo;re using right now.
            </li>
            <li>
              Once connected, ask Claude things like <em>&ldquo;what&rsquo;s on my
              schedule next week?&rdquo;</em> or <em>&ldquo;request a session with my
              trainer Tuesday at 4pm.&rdquo;</em>
            </li>
          </ol>
        </details>

        <details className="text-sm text-black/70 group" open={openByDefault}>
          <summary className="cursor-pointer text-black/80 select-none flex items-center gap-2">
            <span className="dsc-label text-black/40 group-open:hidden">+</span>
            <span className="dsc-label text-black/40 hidden group-open:inline">–</span>
            <span>How to add it to ChatGPT</span>
          </summary>
          <ol className="mt-3 pl-5 list-decimal space-y-1.5 text-black/70">
            <li>
              You&rsquo;ll need ChatGPT Plus (or higher) — custom connectors aren&rsquo;t on the free tier yet.
            </li>
            <li>
              In ChatGPT, open <strong>Settings → Connectors → Create</strong> (or <em>Add</em>).
            </li>
            <li>
              Paste the MCP URL above. Set the auth type to <strong>OAuth</strong>{' '}
              if asked.
            </li>
            <li>
              ChatGPT will redirect you here to sign in and approve access — same
              login you&rsquo;re using right now.
            </li>
            <li>
              In any chat, toggle the DSC connector on, then ask things like{' '}
              <em>&ldquo;check my DSC schedule&rdquo;</em> or{' '}
              <em>&ldquo;find me a slot with my trainer Friday morning.&rdquo;</em>
            </li>
          </ol>
        </details>
      </div>
    </div>
  )
}

// --------- Meet the trainers ---------

function TrainersSection({ trainers }: { trainers: TrainerProfile[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div className="mt-8">
      <div className="dsc-label text-black/40 mb-1">Meet the team</div>
      <h2 className="dsc-headline text-2xl text-black mb-3 leading-tight">
        Your trainers.
      </h2>
      <div className="space-y-2">
        {trainers.map((t) => {
          const isOpen = openId === t.id
          return (
            <div
              key={t.id}
              className="rounded-2xl bg-black/[0.04] overflow-hidden transition-colors"
            >
              <button
                onClick={() => setOpenId(isOpen ? null : t.id)}
                className="w-full text-left p-4 flex items-center gap-3 hover:bg-black/[0.06]"
              >
                {t.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.photoUrl}
                    alt={t.name}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center dsc-headline text-base shrink-0">
                    {t.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-black font-medium truncate">
                    {t.name.split(' ')[0]}
                  </div>
                  {t.title && (
                    <div className="text-xs text-black/60 truncate">
                      {t.title}
                    </div>
                  )}
                </div>
                <span className="dsc-label text-black/40 shrink-0">
                  {isOpen ? '–' : '+'}
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-5 pt-1 text-sm text-black/80 space-y-3">
                  {t.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.photoUrl}
                      alt={t.name}
                      className="w-full aspect-[4/3] rounded-2xl object-cover bg-black/5"
                    />
                  )}
                  {t.bio && (
                    <p className="leading-relaxed">{t.bio}</p>
                  )}
                  {t.specialties.length > 0 && (
                    <div>
                      <div className="dsc-label text-black/40 mb-1.5">
                        Specialties
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {t.specialties.map((s, i) => (
                          <span
                            key={i}
                            className="text-xs bg-white text-black px-2.5 py-1 rounded-full"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {t.certifications.length > 0 && (
                    <div>
                      <div className="dsc-label text-black/40 mb-1.5">
                        Certifications
                      </div>
                      <ul className="text-xs text-black/70 space-y-0.5 list-disc list-inside">
                        {t.certifications.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {t.education && (
                    <div>
                      <div className="dsc-label text-black/40 mb-1.5">
                        Education
                      </div>
                      <p className="text-xs text-black/70 leading-relaxed">
                        {t.education}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --------- What we offer ---------

function ServicesSection({ services }: { services: ServiceEntry[] }) {
  return (
    <div className="mt-8">
      <div className="dsc-label text-black/40 mb-1">What we offer</div>
      <h2 className="dsc-headline text-2xl text-black mb-3 leading-tight">
        Programs &amp; services.
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {services.map((s) => (
          <div
            key={s.slug}
            className="rounded-2xl bg-black/[0.04] p-4"
          >
            <div className="text-black font-medium mb-1">{s.name}</div>
            <p className="text-xs text-black/60 leading-relaxed">
              {s.summary}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// --------- Gym info footer ---------

function GymInfoFooter({ overview }: { overview: GymOverview }) {
  return (
    <div className="mt-8 mb-4 rounded-3xl bg-black/[0.04] p-5">
      <div className="dsc-label text-black/40 mb-1">About DSC</div>
      {overview.tagline && (
        <h2 className="dsc-headline text-xl text-black mb-3 leading-tight">
          {overview.tagline}
        </h2>
      )}
      {overview.about && (
        <p className="text-sm text-black/70 leading-relaxed mb-4">
          {overview.about}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {overview.hours?.summary && (
          <div>
            <div className="dsc-label text-black/40 mb-1">Hours</div>
            <div className="text-sm text-black/80">{overview.hours.summary}</div>
          </div>
        )}
        {overview.locations && overview.locations.length > 0 && (
          <div>
            <div className="dsc-label text-black/40 mb-1">Locations</div>
            <ul className="text-sm text-black/80 space-y-0.5">
              {overview.locations.map((l) => (
                <li key={l.name}>
                  {l.name}, {l.state}
                  {l.comingSoon && (
                    <span className="dsc-label text-black/40 ml-1">
                      (soon)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {overview.contact && (
          <div className="sm:col-span-2">
            <div className="dsc-label text-black/40 mb-1">Contact</div>
            <div className="text-sm text-black/80 flex flex-wrap gap-x-4 gap-y-0.5">
              {overview.contact.email && (
                <a
                  href={`mailto:${overview.contact.email}`}
                  className="hover:text-black"
                >
                  {overview.contact.email}
                </a>
              )}
              {overview.contact.phone && (
                <a
                  href={`tel:${overview.contact.phone}`}
                  className="hover:text-black"
                >
                  {overview.contact.phone}
                </a>
              )}
              {overview.contact.website && (
                <a
                  href={overview.contact.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black"
                >
                  Website
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
