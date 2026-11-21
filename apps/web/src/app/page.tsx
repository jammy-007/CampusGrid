import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BlurText, ConnectingGrid, Magnet, SpotlightCard } from '@/components/ui';
import { getSession } from '@/lib/session';

const FEATURES = [
  {
    title: 'Register & form teams',
    body: 'Sign up for fests, symposiums and hackathons in one click. Form squads instantly with 8-character invite codes or discover open teams.',
    accent: 'rgba(56, 189, 248, 0.22)',
    nodeCode: 'GRID_01',
  },
  {
    title: 'Two-stage signed QR passes',
    body: 'Every registration issues an Ed25519 cryptographically signed dynamic QR pass for entry check-in and exit check-out—even offline.',
    accent: 'rgba(99, 102, 241, 0.22)',
    nodeCode: 'GRID_02',
  },
  {
    title: 'Live announcements & chat',
    body: 'Real-time Socket.IO event broadcasts and low-latency team chat rooms keep participants and organizers synchronized.',
    accent: 'rgba(16, 185, 129, 0.20)',
    nodeCode: 'GRID_03',
  },
  {
    title: 'Hackathon judging & showcase',
    body: 'Submit your GitHub repository, get evaluated against a weighted faculty rubric, and climb the live projector leaderboard.',
    accent: 'rgba(245, 158, 11, 0.20)',
    nodeCode: 'GRID_04',
  },
  {
    title: 'Verified OD certificates & transcripts',
    body: 'Claim official Duty Leave PDFs, winner merit badges, and cumulative semester OD transcripts with instant QR verification.',
    accent: 'rgba(236, 72, 153, 0.20)',
    nodeCode: 'GRID_05',
  },
  {
    title: 'Smart waitlists & calendar sync',
    body: 'Automatic queue promotion when spots open up, one-click Google Calendar & .ics exports, and post-event star ratings.',
    accent: 'rgba(56, 189, 248, 0.22)',
    nodeCode: 'GRID_06',
  },
] as const;

export default async function LandingPage() {
  if (await getSession()) redirect('/dashboard');
  return (
    <div className="space-y-14 py-6">
      <ConnectingGrid>
        <section className="mx-auto max-w-3xl space-y-6 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:text-6xl">
            <BlurText text="Every campus event, one connected grid." stagger={0.07} />
          </h1>

          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-200 drop-shadow-[0_1px_10px_rgba(0,0,0,0.9)] sm:text-lg">
            CampusGrid connects organizers, students, and faculty judges in real time, from team formation and
            offline QR check-in/out to live leaderboards and verified OD transcripts.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-3">
            <Magnet magnetStrength={2.2}>
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-sky-500 px-7 text-sm font-semibold text-white shadow-xl shadow-sky-500/25 ring-1 ring-white/25 transition hover:brightness-110"
              >
                Get started
                <span aria-hidden="true">→</span>
              </Link>
            </Magnet>
            <Magnet magnetStrength={2.8}>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 bg-slate-950/60 px-7 text-sm font-semibold text-white backdrop-blur-md transition hover:border-sky-400/40 hover:bg-slate-900/80"
              >
                Log in to campus
              </Link>
            </Magnet>
          </div>
        </section>
      </ConnectingGrid>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((item) => (
          <SpotlightCard
            key={item.title}
            spotlightColor={item.accent}
            className="flex flex-col justify-between p-6"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold tracking-widest text-sky-400/80">
                  {item.nodeCode}
                </span>
                <span className="size-1.5 rounded-full bg-sky-400/60" />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-white">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-300">{item.body}</p>
            </div>
          </SpotlightCard>
        ))}
      </section>
    </div>
  );
}
