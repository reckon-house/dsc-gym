import { NextResponse } from 'next/server'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '@prisma/client'

export async function GET() {
  const tursoUrl = process.env.TURSO_DATABASE_URL || 'not set'
  const tursoToken = process.env.TURSO_AUTH_TOKEN ? 'set (length: ' + process.env.TURSO_AUTH_TOKEN.length + ')' : 'not set'

  let dbTest = 'not tested'

  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    try {
      const adapter = new PrismaLibSql({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
      const prisma = new PrismaClient({ adapter })
      const count = await prisma.user.count()
      dbTest = `success - ${count} users found`
      await prisma.$disconnect()
    } catch (err) {
      dbTest = `error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return NextResponse.json({
    turso_url_starts: tursoUrl.substring(0, 30),
    turso_url_full: tursoUrl,
    turso_url_length: tursoUrl.length,
    turso_url_protocol: tursoUrl.split('://')[0],
    turso_token: tursoToken,
    node_env: process.env.NODE_ENV,
    db_test: dbTest,
  })
}
