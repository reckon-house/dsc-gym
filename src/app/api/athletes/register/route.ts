import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import {
  buildVerificationEmail,
  generateVerificationToken,
  sendEmail,
} from '@/lib/email'
import { normalizePhone } from '@/lib/phone'
import { publicBaseUrl } from '@/lib/oauth/util'
import { checkRateLimit, clientIp, tooManyRequests, RULES } from '@/lib/rateLimit'

// POST /api/athletes/register - Public athlete self-registration.
// Creates an unverified athlete and sends a verification email.
// Login is blocked until the email is verified.
export async function POST(request: NextRequest) {
  try {
    // Every successful call creates an account and sends an email, so this is
    // the spam surface. A real family registering three kids fits comfortably.
    const rl = await checkRateLimit(RULES.register, clientIp(request))
    if (!rl.allowed) return tooManyRequests(rl, 'sign-ups')

    const body = await request.json()
    const { firstName, lastName, email, phone, password, legalName, birthdate } = body

    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: 'First name and last name are required' },
        { status: 400 }
      )
    }
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }
    const normalizedPhone = normalizePhone(phone ?? '')
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Mobile number is required — enter a 10-digit US number (e.g. 214-555-0123).',
        },
        { status: 400 }
      )
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }
    if (!legalName) {
      return NextResponse.json(
        { success: false, error: 'Legal name is required for waiver' },
        { status: 400 }
      )
    }

    // Birthdate is optional. Stored as a DATE at UTC midnight so it can't
    // drift a day depending on where the server runs. Used for age-banded
    // announcements; nulls are treated as "unknown", never guessed.
    let parsedBirthdate: Date | null = null
    if (birthdate) {
      const raw = String(birthdate).trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return NextResponse.json(
          { success: false, error: 'Birthdate must be YYYY-MM-DD.' },
          { status: 400 }
        )
      }
      const d = new Date(`${raw}T00:00:00.000Z`)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Birthdate is not a real date.' },
          { status: 400 }
        )
      }
      parsedBirthdate = d
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Several kids legitimately share one parent mailbox, so a match here is
    // usually a parent adding a sibling rather than a duplicate signup.
    //
    // The gate is the family password: to attach a new athlete to an existing
    // mailbox you must already know it. Otherwise anyone who guessed a parent's
    // email could add themselves into that family and see the kids' schedules.
    const existing = await db.athlete.findFirst({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'asc' },
    })
    let joiningFamily = false
    if (existing) {
      const knowsFamilyPassword =
        existing.passwordHash && (await verifyPassword(password, existing.passwordHash))
      if (!knowsFamilyPassword) {
        return NextResponse.json(
          {
            success: false,
            error:
              'That email is already registered. To add another athlete to it, use the same password you signed up with.',
          },
          { status: 400 }
        )
      }
      joiningFamily = true
    }

    // True only when this athlete is joining a mailbox that is already
    // confirmed; drives both the stored token and whether we email at all.
    const alreadyVerified = joiningFamily && Boolean(existing!.emailVerified)

    const passwordHash = await hashPassword(password)
    const token = generateVerificationToken()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
    const signedAt = new Date()

    const athlete = await db.athlete.create({
      data: {
        gymId: DEFAULT_GYM_ID,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        birthdate: parsedBirthdate,
        passwordHash,
        trainerId: null,
        // A sibling joining an ALREADY-verified mailbox needs no verification —
        // the parent proved they own it the first time.
        //
        // A sibling joining an unverified one gets a real token of their own.
        // It previously got null while the email still shipped a link built
        // from the generated token, so the second child's link pointed at a
        // token stored nowhere and the parent was told "invalid or already
        // used" for an account that was in fact fine.
        emailVerified: alreadyVerified,
        emailVerificationToken: alreadyVerified ? null : token,
        emailVerificationExpiresAt: alreadyVerified ? null : expiresAt,
        // The "I have read and agree" checkbox on the registration form is
        // the formal sign event — record it here. (Submission is blocked
        // server-side without legalName, and client-side without the
        // checkbox.)
        waiverSignedAt: signedAt,
      },
    })

    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'

    await db.waiverSignature.create({
      data: {
        gymId: DEFAULT_GYM_ID,
        email: normalizedEmail,
        legalName: legalName.trim(),
        ipAddress,
        athleteId: athlete.id,
        signedAt,
      },
    })

    // Build verification URL. publicBaseUrl() respects env overrides
    // (OAUTH_PUBLIC_URL / NEXT_PUBLIC_BASE_URL) and the Vercel-injected
    // VERCEL_PROJECT_PRODUCTION_URL before falling back to the request
    // origin. Same helper the booking-request emails use, so a dev
    // setup that points NEXT_PUBLIC_BASE_URL at prod yields email links
    // that actually work on a phone.
    const origin = request.headers.get('origin')
    const base = publicBaseUrl(origin)
    const verificationUrl = `${base}/athlete/verify?token=${token}`

    // Brand assets for the email. Env overrides take precedence so we
    // can host these on a CDN or pin to a specific deploy URL without
    // code changes.
    const logoUrl = process.env.EMAIL_LOGO_URL ?? `${base}/logo-mark.png`
    const heroImageUrl = process.env.EMAIL_HERO_URL ?? `${base}/email-hero.jpg`

    // Nothing to verify for a sibling on a confirmed mailbox — sending a link
    // there is what produced the bogus "verification failed" page.
    const emailResult = alreadyVerified
      ? { delivered: true }
      : await sendEmail({
          to: normalizedEmail,
          ...buildVerificationEmail({
            firstName: athlete.firstName,
            url: verificationUrl,
            logoUrl,
            heroImageUrl,
          }),
        })

    return NextResponse.json(
      {
        success: true,
        data: {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          email: athlete.email,
        },
        // In dev (no email service configured), expose the URL so the
        // user can click it directly. In prod with Resend wired up,
        // this still echoes but the real link is in the inbox.
        verificationUrl: alreadyVerified || emailResult.delivered ? null : verificationUrl,
        emailDelivered: emailResult.delivered,
        // Lets the form say "you're all set" instead of "check your email".
        alreadyVerified,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error registering athlete:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during registration'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
