/**
 * Seed data from docs/CONTRACT.md. Idempotent: wipes the bmsit institution's data and recreates it.
 * Run: pnpm db:seed
 */
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'password123';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const existing = await prisma.institution.findUnique({ where: { slug: 'bmsit' } });
  if (existing) {
    // Children cascade from events/users; delete events first (organizer FK), then users.
    await prisma.event.deleteMany({ where: { institutionId: existing.id } });
    await prisma.user.deleteMany({ where: { institutionId: existing.id } });
    await prisma.institution.delete({ where: { id: existing.id } });
  }

  const institution = await prisma.institution.create({
    data: { name: 'Brindavan College Of Engineering', slug: 'bmsit' },
  });


  const mk = (email: string, name: string, role: Role, usn?: string) =>
    prisma.user.create({
      data: { institutionId: institution.id, email, name, role, usn, passwordHash },
    });

  await mk('admin@campus.edu', 'Campus Admin', 'ADMIN');
  const org = await mk('org@campus.edu', 'Olivia Organizer', 'ORGANIZER');
  await mk('judge1@campus.edu', 'Prof. Judge One', 'JUDGE');
  await mk('judge2@campus.edu', 'Prof. Judge Two', 'JUDGE');
  // s1–s6 start with no team so the end-to-end demo can register, create and join teams;
  // s7–s12 fill the two pre-made hackathon teams.
  const students = [];
  for (let i = 1; i <= 12; i++) {
    students.push(await mk(`s${i}@campus.edu`, `Student ${i}`, 'STUDENT', `1BY23CS${String(i).padStart(3, '0')}`));
  }

  const now = Date.now();
  const hackathon = await prisma.event.create({
    data: {
      institutionId: institution.id,
      organizerId: org.id,
      title: 'GridHack 2026',
      description: 'A 24-hour campus hackathon. Build something useful for your campus.',
      type: 'HACKATHON',
      venue: 'Main Auditorium',
      startsAt: new Date(now - 2 * HOUR),
      endsAt: new Date(now + 22 * HOUR),
      // Late sign-ups stay open for the first hours so the demo can register and form teams.
      registrationDeadline: new Date(now + 6 * HOUR),
      isTeamEvent: true,
      minTeamSize: 2,
      maxTeamSize: 4,
      capacity: 200,
      status: 'ONGOING',
    },
  });

  await prisma.event.create({
    data: {
      institutionId: institution.id,
      organizerId: org.id,
      title: 'Cultural Night',
      description: 'Music, dance and drama from every department.',
      type: 'FEST',
      venue: 'Open Air Theatre',
      startsAt: new Date(now + 14 * DAY),
      endsAt: new Date(now + 14 * DAY + 5 * HOUR),
      registrationDeadline: new Date(now + 12 * DAY),
      isTeamEvent: false,
      minTeamSize: 1,
      maxTeamSize: 1,
      capacity: 500,
      status: 'PUBLISHED',
    },
  });

  const teams = [
    { name: 'Null Pointers', inviteCode: 'GRDHCK2A', members: students.slice(6, 9) },
    { name: 'Stack Smashers', inviteCode: 'GRDHCK3B', members: students.slice(9, 12) },
  ];
  for (const t of teams) {
    const leader = t.members[0]!;
    const team = await prisma.team.create({
      data: { eventId: hackathon.id, name: t.name, inviteCode: t.inviteCode, leaderId: leader.id },
    });
    for (const m of t.members) {
      await prisma.teamMember.create({ data: { teamId: team.id, userId: m.id } });
      await prisma.registration.create({ data: { eventId: hackathon.id, userId: m.id, teamId: team.id } });
    }
  }

  console.log(`Seeded institution "bmsit": 16 users (password "${PASSWORD}"), 2 events, 2 teams.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
