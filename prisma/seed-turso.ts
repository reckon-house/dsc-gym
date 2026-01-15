import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as path from 'path'

// Load .env file manually since dotenv has issues with tsx
const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  const envLines = envContent.split('\n')
  for (const line of envLines) {
    const match = line.match(/^([^#=]+)=["']?([^"'\n]*)["']?$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }
}

async function main() {
  console.log('Connecting to:', process.env.TURSO_DATABASE_URL)

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  }

  const libsql = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  const adapter = new PrismaLibSql(libsql)
  const prisma = new PrismaClient({ adapter })

  console.log('Seeding Turso database...')

  // Clear existing data
  await prisma.checkIn.deleteMany()
  await prisma.session.deleteMany()
  await prisma.athlete.deleteMany()
  await prisma.trainer.deleteMany()
  await prisma.user.deleteMany()

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.create({
    data: {
      email: 'admin@dsc.com',
      passwordHash: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
  })
  console.log('Created admin:', admin.email)

  // Create trainers with athletes
  const trainersWithAthletes = [
    {
      trainer: { name: 'Mike Johnson', email: 'mike@dsc.com' },
      athletes: [
        { firstName: 'Marcus', lastName: 'Chen' },
        { firstName: 'Priya', lastName: 'Patel' },
        { firstName: 'Derek', lastName: 'Thompson' },
        { firstName: 'Kenji', lastName: 'Watanabe' },
      ],
    },
    {
      trainer: { name: 'Sarah Williams', email: 'sarah@dsc.com' },
      athletes: [
        { firstName: 'Elena', lastName: 'Rodriguez' },
        { firstName: 'Brandon', lastName: 'Mitchell' },
        { firstName: 'Aaliyah', lastName: 'Jackson' },
        { firstName: 'Trevor', lastName: 'Nguyen' },
      ],
    },
    {
      trainer: { name: 'Chris Davis', email: 'chris@dsc.com' },
      athletes: [
        { firstName: 'Jasmine', lastName: 'Kumar' },
        { firstName: 'Ryan', lastName: "O'Brien" },
        { firstName: 'Fatima', lastName: 'Al-Hassan' },
        { firstName: 'Lucas', lastName: 'Fernandez' },
      ],
    },
    {
      trainer: { name: 'Emily Brown', email: 'emily@dsc.com' },
      athletes: [
        { firstName: 'Zoe', lastName: 'Campbell' },
        { firstName: 'Isaiah', lastName: 'Brooks' },
        { firstName: 'Nina', lastName: 'Kowalski' },
        { firstName: 'Raj', lastName: 'Sharma' },
      ],
    },
    {
      trainer: { name: 'James Wilson', email: 'james@dsc.com' },
      athletes: [
        { firstName: 'Olivia', lastName: 'Santos' },
        { firstName: 'Dante', lastName: 'Williams' },
        { firstName: 'Mia', lastName: 'Johansson' },
        { firstName: 'Andre', lastName: 'Baptiste' },
      ],
    },
    {
      trainer: { name: 'Lisa Martinez', email: 'lisa@dsc.com' },
      athletes: [
        { firstName: 'Chloe', lastName: 'Nakamura' },
        { firstName: 'Jamal', lastName: 'Richardson' },
        { firstName: 'Sofia', lastName: 'Andersson' },
        { firstName: 'Ethan', lastName: 'Park' },
      ],
    },
  ]

  const trainerPassword = await bcrypt.hash('trainer123', 10)

  for (const { trainer: trainerData, athletes: athleteList } of trainersWithAthletes) {
    const user = await prisma.user.create({
      data: {
        email: trainerData.email,
        passwordHash: trainerPassword,
        name: trainerData.name,
        role: 'TRAINER',
        trainer: {
          create: {},
        },
      },
      include: { trainer: true },
    })
    console.log('Created trainer:', user.name)

    for (let i = 0; i < athleteList.length; i++) {
      const { firstName, lastName } = athleteList[i]
      const athlete = await prisma.athlete.create({
        data: {
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace("'", "")}@email.com`,
          trainerId: user.trainer!.id,
        },
      })
      console.log(`  Created athlete: ${athlete.firstName} ${athlete.lastName}`)

      // Create a session for today
      const today = new Date()
      today.setHours(9 + i * 2, 0, 0, 0)

      await prisma.session.create({
        data: {
          trainerId: user.trainer!.id,
          athleteId: athlete.id,
          scheduledAt: today,
          duration: 60,
        },
      })

      // Create a session for tomorrow
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(10 + i, 0, 0, 0)

      await prisma.session.create({
        data: {
          trainerId: user.trainer!.id,
          athleteId: athlete.id,
          scheduledAt: tomorrow,
          duration: 60,
        },
      })
    }
  }

  console.log('Turso seeding complete!')
  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
