import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

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

  // Create 6 trainers with unique athletes for each
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
        { firstName: 'Ryan', lastName: 'O\'Brien' },
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
      today.setHours(9 + i * 2, 0, 0, 0) // Sessions at 9am, 11am, 1pm, 3pm

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
      tomorrow.setHours(10 + i, 0, 0, 0) // Sessions at 10am, 11am, 12pm, 1pm

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

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
