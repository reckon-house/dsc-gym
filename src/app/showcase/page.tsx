// Public walkthrough page for showing the app to colleagues / prospects
// without needing them to log in. Lives at /showcase. Mobile-first
// screenshots side-by-side with neutral explainer captions of what's
// happening on each screen.

import Image from 'next/image'
import Link from 'next/link'

interface Shot {
  src: string
  alt: string
  title: string
  caption: string
}

const ATHLETE: Shot[] = [
  {
    src: '/showcase/01-athlete-landing.png',
    alt: 'Athlete landing page',
    title: 'Athlete landing',
    caption:
      'First touchpoint for new and returning athletes. Sign in or register from one screen, branded with the gym’s monogram and hero photo.',
  },
  {
    src: '/showcase/02-athlete-login.png',
    alt: 'Athlete login screen',
    title: 'Sign in — email or mobile',
    caption:
      'Athletes log in with either their email or their phone number. The form sniffs the input as they type and swaps to a numeric keyboard for phone, an email keyboard for email.',
  },
  {
    src: '/showcase/03-athlete-register.png',
    alt: 'Athlete registration form',
    title: 'Register',
    caption:
      'Five fields plus waiver acknowledgement. Email and phone are both required; phone normalizes to E.164 so we can text-or-call later. Waiver is signed at registration time, not deferred.',
  },
  {
    src: '/showcase/05-athlete-dashboard-top.png',
    alt: 'Top of athlete dashboard',
    title: 'Dashboard — next session',
    caption:
      '"Up next" hero card surfaces the athlete’s very next session. Recent activity right below it shows approved or declined booking requests, with the trainer’s reason quoted in line.',
  },
  {
    src: '/showcase/06-athlete-trainer-bio.png',
    alt: 'Trainer bio expanded',
    title: 'Meet the team',
    caption:
      'Each trainer’s row expands into a full bio: photo, paragraph, specialty pills, certifications, and education. Same data is also returned by the MCP server so connected AIs can answer "tell me about Jordan" with a real, grounded response.',
  },
  {
    src: '/showcase/07-athlete-connect-ai.png',
    alt: 'Connect to AI section',
    title: 'Connect to AI',
    caption:
      'Athletes paste this MCP URL into Claude.ai or ChatGPT and can manage their schedule through their AI of choice. Owner still approves any new bookings. Status pill shows the real connection state — not whatever the AI vendor’s UI happens to display.',
  },
  {
    src: '/showcase/08-oauth-consent.png',
    alt: 'OAuth consent page',
    title: 'Consent screen',
    caption:
      'When an athlete connects Claude.ai or ChatGPT, the OAuth flow lands here. Branded under DSC, lists exactly what access the AI is being granted. Approval issues a short-lived bearer token; refresh tokens rotate every cycle.',
  },
  {
    src: '/showcase/04-athlete-dashboard-full.png',
    alt: 'Full athlete dashboard',
    title: 'Dashboard — full scroll',
    caption:
      'The complete dashboard end to end: upcoming sessions, recent booking decisions, "Meet the team", "Programs & services", Connect-to-AI, and a footer with mission, hours, locations, and contact links.',
  },
]

// Screenshots from a live Claude.ai chat where the athlete uses the
// DSC connector to check their schedule, look up a trainer, find an
// open slot, and book a session — followed by the admin-side view of
// the request landing in the owner's queue.
const AI_IN_ACTION: Shot[] = [
  {
    src: '/showcase/19-mcp-chat-1-schedule.png',
    alt: 'Claude.ai showing the athlete their schedule',
    title: '"What\'s on my schedule?"',
    caption:
      'The athlete asks their everyday AI a casual question. Claude calls the my_sessions tool against DSC, gets back the athlete\'s actual upcoming training, and answers in plain English with the time in Central. The "Loaded tools, used DSC integration" pill is Claude\'s native indicator that it called a connector.',
  },
  {
    src: '/showcase/20-mcp-chat-2-trainer-bio.webp',
    alt: 'Claude.ai returning a trainer bio',
    title: '"Tell me about a trainer."',
    caption:
      'Claude pulls the full trainer profile — bio, specialties, certifications. It also cross-references the athlete\'s upcoming session and proactively offers a related next action ("your upcoming session is with Scott, not Jordan — want Scott\'s bio?"). Real reasoning across multiple tool calls.',
  },
  {
    src: '/showcase/21-mcp-chat-3-suggest-slots.webp',
    alt: 'Claude.ai listing open training slots',
    title: '"Find me an open slot."',
    caption:
      'The suggest_slots tool returns every available 60-minute opening with the athlete\'s trainer on a chosen morning. Claude formats it in clean groupings and ends with the right next-action prompt: "Just say the time and I\'ll send the booking request to the gym for approval."',
  },
  {
    src: '/showcase/22-mcp-chat-4-request-session.webp',
    alt: 'Claude.ai confirming a booking request was sent',
    title: '"Book the slot."',
    caption:
      'One short reply books it. Claude fires request_session, the server creates a real BookingRequest with status=pending, and Claude confirms with the exact time + duration + a note that the gym still needs to approve. Notice the contextual touch: "That\'ll put you at two sessions next week alongside the Wednesday 9 AM" — Claude remembered the existing session from earlier in the conversation.',
  },
  {
    src: '/showcase/18-admin-via-ai-request.png',
    alt: 'Admin home showing the VIA AI booking request',
    title: 'The owner\'s side — instantly.',
    caption:
      'The request from Claude lands in the owner\'s queue within seconds, tagged "VIA AI" so they know it came from an athlete\'s connected assistant. One tap to Approve or Decline. The engine re-validates on approve — even AI-initiated bookings can\'t bypass conflict rules.',
  },
]

const ADMIN: Shot[] = [
  {
    src: '/showcase/09-staff-login.png',
    alt: 'Staff login screen',
    title: 'Staff sign in',
    caption:
      'Owner and trainers sign in here. Same brand language as the athlete side but visually distinct so the two surfaces don’t bleed together.',
  },
  {
    src: '/showcase/10-admin-home.png',
    alt: 'Admin home with booking request',
    title: 'Owner home',
    caption:
      'Inbound work shows up at the top: booking requests from AIs (with the athlete’s note quoted), new registrations awaiting trainer assignment, walk-ins. Below that, four action cards lead into the main workspaces.',
  },
  {
    src: '/showcase/17-admin-chat-bulk.png',
    alt: 'Admin chat with bulk request',
    title: 'Chat — talk to the scheduler',
    caption:
      'The owner can describe a week’s worth of scheduling in natural language and the AI handles it. Here it parallelizes athlete lookups across multiple tool calls, catches that two requested times were already in the past, detects the Derek/Jeremy conflict, and stops to ask for direction before committing anything. Every booking decision flows through the engine — the AI is the interface, the engine is the authority.',
  },
  {
    src: '/showcase/11-admin-calendar-week.png',
    alt: 'Admin calendar week view',
    title: 'Calendar — week',
    caption:
      'One card per day of the current week. Each card previews the day’s sessions. Today’s card is dark; rest are the brand’s faint grey. Tap any card to drill into the day.',
  },
  {
    src: '/showcase/12-admin-calendar-day.png',
    alt: 'Admin calendar day detail',
    title: 'Calendar — day detail',
    caption:
      'Full day at a glance. Tap any session to edit (move, change trainer, cancel) through a slide-up sheet. All edits flow through the engine and re-validate. Group sessions show their attendees as "Name +N".',
  },
  {
    src: '/showcase/13-admin-trainers.png',
    alt: 'Admin trainers view',
    title: 'Trainers',
    caption:
      'Each trainer’s weekly hours, athlete count, and today’s progress. Editing hours updates the engine’s availability windows immediately — the next booking attempt for that trainer respects the new schedule.',
  },
  {
    src: '/showcase/14-admin-athletes.png',
    alt: 'Admin athletes list',
    title: 'Athletes',
    caption:
      'Searchable roster. Unassigned athletes are flagged at the top of the list so the owner can quickly route new registrations to a trainer. Tap an athlete to open their detail page.',
  },
  {
    src: '/showcase/15-admin-athlete-detail.png',
    alt: 'Athlete detail with standing slots',
    title: 'Athlete detail',
    caption:
      'Individual athlete view. Identity card, trainer assignment, session and check-in counts. "Recurring slots" lets the owner lock in a standing weekly time (e.g. Jeremy every Wednesday 9am with Scott) and auto-materialize the next 8 weeks of sessions — engine-validated, conflict-aware.',
  },
]

export default function ShowcasePage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-4 flex items-center justify-between border-b border-black/10">
        <Link href="/" aria-label="DSC home" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="DSC" width={36} height={36} />
        </Link>
        <span className="dsc-label text-black/40">Walkthrough</span>
      </header>

      <section className="px-4 py-12 md:py-16 max-w-3xl mx-auto">
        <div className="dsc-label text-black/40 mb-2">DSC GYM</div>
        <h1 className="dsc-headline text-5xl md:text-7xl text-black leading-[0.9] mb-6">
          A schedule
          <br />
          your athletes
          <br />
          run themselves.
        </h1>
        <p className="text-lg md:text-xl text-black/70 leading-relaxed mb-3">
          Athletes manage their training schedule from any AI they already use —
          Claude.ai, ChatGPT, anything MCP-compatible. The gym owner approves
          requests from a single screen and the underlying scheduling engine
          keeps every booking honest.
        </p>
        <p className="text-sm text-black/50">
          Mobile screenshots from the live production build at{' '}
          <code className="font-mono">dsc-gym.vercel.app</code>.
        </p>
      </section>

      <Section
        eyebrow="The athlete experience"
        title="What athletes see."
        shots={ATHLETE}
      />

      <Section
        eyebrow="The AI integration in action"
        title="Through their own AI."
        shots={AI_IN_ACTION}
      />

      <Section
        eyebrow="The owner experience"
        title="What the admin sees."
        shots={ADMIN}
      />

      <section className="px-4 py-16 md:py-24 max-w-3xl mx-auto text-center border-t border-black/10">
        <div className="dsc-label text-black/40 mb-2">Under the hood</div>
        <h2 className="dsc-headline text-3xl md:text-5xl text-black leading-tight mb-6">
          One engine. One source of truth.
        </h2>
        <p className="text-base md:text-lg text-black/70 leading-relaxed max-w-2xl mx-auto">
          Every booking — whether it came from the owner&rsquo;s chat, the
          athlete&rsquo;s connected AI, or a tap-to-edit on the calendar — flows
          through a single deterministic scheduling engine that checks trainer
          availability, double-bookings, gym floor cap, allowed durations, and
          cancellation rules. The AIs are the interface; the engine is the
          authority.
        </p>
      </section>

      <footer className="px-4 py-10 border-t border-black/10 text-center">
        <p className="dsc-label text-black/40">DALLAS SPORTS COLLECTIVE</p>
      </footer>
    </div>
  )
}

function Section({
  eyebrow,
  title,
  shots,
}: {
  eyebrow: string
  title: string
  shots: Shot[]
}) {
  return (
    <section className="px-4 py-12 md:py-16 max-w-5xl mx-auto">
      <div className="mb-8 md:mb-12">
        <div className="dsc-label text-black/40 mb-2">{eyebrow}</div>
        <h2 className="dsc-headline text-3xl md:text-5xl text-black leading-tight">
          {title}
        </h2>
      </div>
      <div className="space-y-12 md:space-y-16">
        {shots.map((shot, i) => (
          <article
            key={shot.src}
            className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 md:gap-10 items-start"
          >
            {/* Phone frame */}
            <div className="md:order-1 mx-auto md:mx-0 max-w-[320px] w-full">
              <div className="rounded-[28px] bg-black p-[10px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]">
                <div className="rounded-[20px] overflow-hidden bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot.src}
                    alt={shot.alt}
                    className="block w-full h-auto"
                  />
                </div>
              </div>
            </div>

            {/* Caption */}
            <div className="md:order-2 md:pt-6">
              <div className="dsc-label text-black/40 mb-2">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="dsc-headline text-2xl md:text-3xl text-black mb-3 leading-tight">
                {shot.title}
              </h3>
              <p className="text-base text-black/70 leading-relaxed">
                {shot.caption}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// Suppress the unused Image import warning — kept for potential
// migration to next/image later if we want to lean on its optimization.
void Image
