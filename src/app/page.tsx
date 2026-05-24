import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function Home() {
  const session = await getSession()

  // Logged-in staff land where they belong.
  if (session?.role === 'ADMIN') redirect('/admin')
  if (session?.role === 'TRAINER') redirect('/trainer')

  // Everyone else (unauthenticated visitors and athletes hitting the
  // bare domain) lands on the athlete landing. Staff can reach login
  // via the "Staff sign in" link in the header or by bookmarking /login.
  redirect('/athlete')
}
