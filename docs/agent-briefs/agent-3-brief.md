# Agent 3 — Real-time team chat

You are Agent 3 of 4 building CampusGrid. The Shared Contract below is binding. Agent 1 publishes the scaffold as tag `phase-0` on `main`; until then build the pure pieces listed under "Before phase-0" in a scratch folder.

## What you own
`prisma/schema/chat.prisma`, `apps/api/src/modules/chat`, `apps/api/src/realtime/chat.ts` (the `registerChat(io)` function), `packages/shared/src/chat.ts`, web `features/chat/*` (must export `TeamChat`).

## Behaviour
- **Auto-provisioning:** subscribe to `team.created` on the bus and create the team's `ChatRoom` (idempotent). Post a system message ("Team <name> created. Share invite code with teammates."). On `team.member_joined` / `team.member_left`, post system messages ("Priya joined the team") and, via `getIO()`, make any connected sockets of a removed member leave `team:<teamId>`.
- Also provision lazily: if a room is missing when a member opens chat, create it (covers teams made before your code landed).
- **Socket namespace `/chat`** exactly as in the contract: on `chat:join` check the user is a `TeamMember` of that team, else emit `chat:error { code: 'FORBIDDEN' }`. On `chat:send`, validate with zod (1 to 2000 chars, trimmed), persist, broadcast `chat:message` to `team:<teamId>` including the sender's `clientId` so the sender can swap its optimistic message. Rate-limit 10 messages / 10 s per user. `chat:typing` is broadcast to others only, not persisted.
- `ChatMessageDTO = { id, teamId, sender: { id, name } | null (null = system), body, createdAt, clientId? }` in `packages/shared/src/chat.ts`.
- **History:** `GET /api/teams/:teamId/chat/messages?before=<iso>&limit=50` (members only), newest first, cursor pagination.
- **UI `<TeamChat teamId>`:** message list with infinite scroll up, auto-scroll on new message when already at bottom, optimistic send with retry on failure, typing indicator, day separators, system messages styled differently, connection status pill ("reconnecting…"), rejoin + fetch missed messages after reconnect. Plain text only; render as text (no HTML) and autolink URLs safely. Works in the narrow column of the team page and on phones.
- Unread badge: export `useUnreadCount(teamId)` from `features/chat` (last-read timestamp in localStorage) so Agent 1 can show it in the nav or dashboard.

## Before phase-0 (no scaffold needed)
Chat UI components against a mock socket, the DTO and zod schemas, rate limiter with tests.

## Tests
Non-member cannot join or read history; auto-provisioning on `team.created` is idempotent; rate limit; pagination order. Two-browser manual check from the contract's demo step 2.

## Don't touch
Other agents' paths, including `realtime/io.ts` and the team page itself (Agent 1 renders your component). Need something there? Add it to `docs/REQUESTS.md`.


---

# CampusGrid Shared Contract (read this before writing any code)

CampusGrid is a multi-tenant campus event platform: students register for fests, symposiums and hackathons, form teams with invite codes, get cryptographically signed QR passes, check in via a camera scanner (offline-capable), chat with their team in real time, and (for hackathons) submit a GitHub repo that faculty judges score against a weighted rubric feeding a live leaderboard. Organizers issue verified Duty Leave (OD) certificates.

Four agents build it in parallel. This contract is the single source of truth for folder ownership, data model and interfaces. **If you need something outside your owned files, do not edit it: add a line to `docs/REQUESTS.md` naming the owner and what you need, and code against the interface described here.**

## Stack (fixed)

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces, Node 20, TypeScript everywhere (strict) |
| Web | Next.js 15 (App Router) + Tailwind CSS, in `apps/web` |
| API | Node.js + Express + Socket.IO, in `apps/api` |
| DB | PostgreSQL 16 (docker-compose) + Prisma ORM, multi-file schema in `apps/api/prisma/schema/` |
| Validation / types | zod schemas in `packages/shared`, imported by web and api as `@campusgrid/shared` |
| Auth | Email + password (bcrypt), JWT in an httpOnly cookie `cg_token` |
| Tests | Vitest (api + shared), Playwright optional for e2e |

Ports: web `3000`, api `4000`, Postgres `5432`. Next.js rewrites `/api/*` to `http://localhost:4000/api/*` so cookies are same-origin. Socket.IO clients connect to `NEXT_PUBLIC_WS_URL` (default `http://localhost:4000`) with `withCredentials: true`.

## Repo layout and ownership

```
campusgrid/
├── package.json, pnpm-workspace.yaml, docker-compose.yml, .env.example   → Agent 1
├── docs/CONTRACT.md (this file), docs/REQUESTS.md                        → Agent 1 (others append to REQUESTS.md only)
├── packages/shared/src/
│   ├── index.ts, auth.ts, events.ts, teams.ts, roles.ts                  → Agent 1
│   ├── passes.ts, checkin.ts, certificates.ts                            → Agent 2
│   ├── chat.ts                                                           → Agent 3
│   └── hackathon.ts                                                      → Agent 4
├── apps/api/
│   ├── prisma/schema/base.prisma, core.prisma, seed.ts                   → Agent 1
│   ├── prisma/schema/passes.prisma                                       → Agent 2
│   ├── prisma/schema/chat.prisma                                         → Agent 3
│   ├── prisma/schema/hackathon.prisma                                    → Agent 4
│   └── src/
│       ├── server.ts, app.ts, lib/*, middleware/*, realtime/io.ts        → Agent 1
│       ├── modules/auth, users, events, registrations, teams             → Agent 1
│       ├── modules/passes, checkin, certificates                         → Agent 2
│       ├── modules/chat, realtime/chat.ts                                → Agent 3
│       └── modules/submissions, judging, leaderboard, realtime/leaderboard.ts → Agent 4
└── apps/web/src/
    ├── app/layout.tsx, app/page.tsx, components/ui/*, components/nav/*, lib/* → Agent 1
    ├── app/(auth)/*, app/dashboard, app/events (list, new, [id], [id]/manage), app/teams/[id] → Agent 1
    ├── app/pass/*, app/events/[id]/scan, app/events/[id]/attendance, app/verify/*, app/certificates, features/checkin/* → Agent 2
    ├── features/chat/*                                                    → Agent 3
    └── app/events/[id]/submit, [id]/judge, [id]/leaderboard, [id]/rubric, features/hackathon/* → Agent 4
```

`apps/api/src/app.ts` mounts every module router. Agent 1 pre-mounts all of them in Phase 0 against stub `index.ts` files, so the other agents never touch `app.ts`: each module exports `router` from `apps/api/src/modules/<name>/index.ts`.

Dependencies: add only to your own app, with `pnpm --filter <app> add <pkg>`. On a `pnpm-lock.yaml` conflict, take main's version and re-run `pnpm install`; never hand-edit the lockfile.

## Git workflow

- `main` is protected by convention: work on your branch, open a PR, merge only when `pnpm lint && pnpm typecheck && pnpm test` pass.
- Branches: `agent-1/core`, `agent-2/passes-checkin`, `agent-3/chat`, `agent-4/hackathon`. If all agents share one folder, use `git worktree add ../cg-agent-N agent-N/...` so you never switch each other's checkouts.
- Pull `main` into your branch before every migration and before opening a PR.
- Migrations: `pnpm --filter api prisma migrate dev --name <agentN>_<what>`. Never edit or delete a migration another agent created.

## Roles (RBAC)

`STUDENT`, `ORGANIZER`, `JUDGE` (faculty), plus `ADMIN` (institution admin, seeded only). Every row that belongs to a campus carries `institutionId`; every query is scoped to `req.user.institutionId`.

## Data model (Agent 1 creates ALL of these in Phase 0; each agent owns later edits to its own file)

`core.prisma` (Agent 1):
- `Institution { id, name, slug @unique }`
- `User { id, institutionId, email @unique, passwordHash, name, usn?, role, createdAt }`
- `Event { id, institutionId, organizerId, title, description, type (FEST|SYMPOSIUM|HACKATHON|WORKSHOP), venue, startsAt, endsAt, registrationDeadline, isTeamEvent, minTeamSize, maxTeamSize, capacity?, status (DRAFT|PUBLISHED|ONGOING|COMPLETED), createdAt }`
- `Registration { id, eventId, userId, teamId?, status (CONFIRMED|CANCELLED), createdAt, @@unique([eventId, userId]) }`
- `Team { id, eventId, name, inviteCode @unique (8 chars, A-Z0-9 without 0/O/1/I), leaderId, createdAt, @@unique([eventId, name]) }`
- `TeamMember { teamId, userId, joinedAt, @@id([teamId, userId]) }`

`passes.prisma` (Agent 2):
- `EventPass { id, registrationId @unique, secretVersion Int @default(1), issuedAt, revokedAt? }`
- `CheckIn { id, registrationId, eventId, scannedById, scannedAt, deviceId, clientScanId @unique, syncedAt }`
- `Certificate { id, registrationId @unique, serial @unique, verifyCode @unique, issuedById, issuedAt, pdfPath? }`

`chat.prisma` (Agent 3):
- `ChatRoom { id, teamId @unique, createdAt }`
- `ChatMessage { id, roomId, senderId, body (≤ 2000 chars), createdAt, @@index([roomId, createdAt]) }`

`hackathon.prisma` (Agent 4):
- `Submission { id, eventId, teamId @unique, repoUrl, repoOwner, repoName, defaultBranch, lastCommitSha, lastCommitAt, demoUrl?, description, validatedAt, submittedAt, updatedAt }`
- `Rubric { id, eventId @unique }`
- `RubricCriterion { id, rubricId, name, description, weight Float, maxScore Int, order Int }`
- `JudgeAssignment { eventId, judgeId, @@id([eventId, judgeId]) }`
- `Score { id, submissionId, judgeId, criterionId, value Int, comment?, updatedAt, @@unique([submissionId, judgeId, criterionId]) }`

Prisma needs back-relation fields on both sides, so Agent 1 adds the relation fields to User/Event/Registration/Team when creating all files in Phase 0. After Phase 0, if you need a new relation on a core model, request it in `docs/REQUESTS.md`.

## API conventions

- REST under `/api`, JSON in/out, request bodies validated with zod schemas from `@campusgrid/shared`.
- Errors: HTTP status + `{ "error": { "code": "SNAKE_CASE", "message": "human text" } }`.
- Auth helpers exported by Agent 1 from `apps/api/src/middleware/auth.ts`:
  - `requireAuth` → sets `req.user = { id, role, institutionId, name, email }`, 401 otherwise.
  - `requireRole(...roles)` → 403 unless `req.user.role` is one of them.
  - `requireEventOrganizer(paramName = 'eventId')` → 403 unless the user organizes that event (or is ADMIN).
- Prisma client: `import { prisma } from '../../lib/prisma'`.
- Internal event bus (Agent 1, `apps/api/src/lib/bus.ts`, a typed EventEmitter). Payloads:
  - `team.created { teamId, eventId, leaderId }`
  - `team.member_joined { teamId, userId }` / `team.member_left { teamId, userId }`
  - `registration.created { registrationId, eventId, userId }` / `registration.cancelled { registrationId }`
  - `checkin.recorded { eventId, registrationId, scannedAt }` (emitted by Agent 2)
  - `score.updated { eventId, submissionId }` (emitted by Agent 4)

## Endpoint map (owner → prefix)

| Owner | Endpoints |
|---|---|
| Agent 1 | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; `GET/POST /api/events`, `GET/PATCH/DELETE /api/events/:eventId`, `POST /api/events/:eventId/publish`; `POST/DELETE /api/events/:eventId/register`, `GET /api/events/:eventId/registrations` (organizer); `POST /api/events/:eventId/teams`, `POST /api/teams/join { inviteCode }`, `GET /api/teams/:teamId`, `DELETE /api/teams/:teamId/members/:userId`, `GET /api/me/registrations`, `GET /api/me/teams` |
| Agent 2 | `GET /api/passes/:registrationId/token`, `GET /api/events/:eventId/checkin/bundle` (scanner offline bundle), `POST /api/checkin/sync`, `GET /api/events/:eventId/attendance` (+ `?format=csv`), `POST /api/events/:eventId/certificates/issue`, `GET /api/certificates/:id/pdf`, `GET /api/me/certificates`, `GET /api/verify/:verifyCode` (public) |
| Agent 3 | `GET /api/teams/:teamId/chat/messages?before=<iso>&limit=50` (history) |
| Agent 4 | `PUT /api/events/:eventId/submissions/mine`, `GET /api/events/:eventId/submissions`, `POST /api/submissions/:id/revalidate`; `GET/PUT /api/events/:eventId/rubric`; `GET/PUT /api/events/:eventId/judges`; `GET /api/judge/events/:eventId/queue`, `PUT /api/submissions/:id/scores`; `GET /api/events/:eventId/leaderboard` |

## Realtime (Socket.IO)

Agent 1 owns `apps/api/src/realtime/io.ts`: creates the server, runs the auth middleware (reads `cg_token` cookie, sets `socket.data.user`), and exports `getIO()`. It calls `registerChat(io)` from `realtime/chat.ts` and `registerLeaderboard(io)` from `realtime/leaderboard.ts` (stubs in Phase 0).

- Namespace `/chat` (Agent 3): client emits `chat:join { teamId }`, `chat:send { teamId, body, clientId }`, `chat:typing { teamId }`; server emits `chat:message ChatMessageDTO`, `chat:typing { teamId, userId, name }`, `chat:error { code, message }`. Room name `team:<teamId>`; only team members may join.
- Namespace `/live` (Agent 4, Agent 2 may also emit): client emits `live:subscribe { eventId }`; server emits `leaderboard:update LeaderboardDTO` and `checkin:count { eventId, checkedIn, registered }` to room `event:<eventId>`.

## Web conventions

- Agent 1 provides `components/ui/*` (Button, Card, Input, Badge, Table, Dialog, Toast), `lib/api.ts` (typed `apiFetch`), `lib/session.ts` (`useSession()`, server-side `getSession()`), `lib/socket.ts` (`getSocket(namespace)`), and the nav with links to every route in the ownership table.
- Feature slots Agent 1 renders from Phase 0 with placeholder components the owner later replaces:
  - `/teams/[id]` renders `<TeamChat teamId={id} />` from `@/features/chat` (Agent 3).
  - `/events/[id]` renders `<EventPassButton registrationId=… />` from `@/features/checkin` (Agent 2) and, for hackathons, `<HackathonPanel eventId=… />` from `@/features/hackathon` (Agent 4).
  - `/events/[id]/manage` renders tabs linking to scan, attendance, certificates (Agent 2) and rubric, judges, leaderboard (Agent 4).
- Mobile-first: the pass and scanner pages must work on a phone.

## Phases

1. **Phase 0 (Agent 1 alone, others prepare in parallel):** scaffold, full schema + first migration, shared package, auth + middleware, bus, socket bootstrap, all stubs and slots, seed data. Merge to `main` and tag `phase-0`.
2. **Phase 1 (all four in parallel):** each agent builds its features on its own branch, pulling `main` often.
3. **Phase 2 (integration, led by Agent 1):** run the end-to-end demo script below; each agent fixes bugs in its own area.

While waiting for `phase-0`, Agents 2 to 4 build pure logic and UI that don't need the scaffold (listed in their briefs) in a scratch folder, and move it into their owned paths once `phase-0` is on `main`.

## Seed data (Agent 1, `pnpm --filter api db:seed`)

Institution `bmsit` · password `password123` for all:
`admin@campus.edu` (ADMIN), `org@campus.edu` (ORGANIZER), `judge1@campus.edu`, `judge2@campus.edu` (JUDGE), `s1@campus.edu`…`s6@campus.edu` (STUDENT). Events: one published HACKATHON "GridHack 2026" (team event, 2 to 4 members, ongoing) and one published FEST "Cultural Night" (individual). Two hackathon teams with 3 students each.

## End-to-end demo (definition of done)

1. s1 registers for GridHack, creates team → invite code; s2, s3 join with the code.
2. Team chat opens automatically; messages appear live in two browsers.
3. s1 opens the pass; org scans it on a phone with Wi-Fi off, turns Wi-Fi on, attendance syncs. Scan to "checked in" is under 2 seconds. A screenshot of an expired QR is rejected; a second scan shows "already checked in".
4. s1 submits a GitHub repo URL; an invalid or private repo is rejected with a clear message.
5. org sets a rubric and assigns judges; judge1 and judge2 score; the leaderboard updates live without refresh.
6. org issues OD certificates to checked-in attendees; s1 downloads the PDF; `/verify/<code>` shows it as genuine.
