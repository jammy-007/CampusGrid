# CampusGrid

A unified event organizing platform: one place for campus events to be created, hosted and managed. Students register for fests, symposiums and hackathons, form teams with invite codes, check in with signed QR passes, chat with their team, and get verified Duty Leave (OD) certificates. Hackathons add GitHub repo submissions, rubric judging and a live leaderboard.

## Getting started

Needs Node 20+, pnpm 10 (`corepack enable`) and Docker.

```bash
cp .env.example .env
pnpm i && docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev
```

Web runs on http://localhost:3000 and the API on http://localhost:4000. Seeded accounts all use the password `password123`: `admin@campus.edu`, `org@campus.edu`, `judge1@campus.edu`, `judge2@campus.edu`, `s1@campus.edu` to `s6@campus.edu`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Web and API together, with reload |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Must pass before merging to `main` |
| `pnpm db:migrate` | Apply migrations (and create one when the schema changed) |
| `pnpm db:seed` | Reset and reseed the demo institution |

## Layout

```
apps/web         Next.js 15 (App Router, Tailwind)
apps/api         Express + Socket.IO + Prisma
packages/shared  zod schemas and types shared by web and api (@campusgrid/shared)
docs/            CONTRACT.md (ownership, data model, interfaces) and REQUESTS.md
```

Four agents build CampusGrid in parallel; [docs/CONTRACT.md](docs/CONTRACT.md) says who owns which files and the interfaces between them.
