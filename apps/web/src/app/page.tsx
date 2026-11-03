import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BlurText, DecryptedText, Magnet, ShinyText, SpotlightCard } from '@/components/ui';
import { getSession } from '@/lib/session';

const FEATURES = [
  {
    step: '01 // TEAMS',
    title: 'Register & form teams',
    body: 'Sign up for fests, symposiums and hackathons in one click. Form squads instantly with 8-character invite codes.',
    accent: 'rgba(56, 189, 248, 0.22)',
  },
  {
    step: '02 // CRYPTO QR',
    title: 'Signed QR passes',
    body: 'Every registration issues an Ed25519 cryptographically signed dynamic QR pass that verifies in milliseconds—even offline.',
    accent: 'rgba(99, 102, 241, 0.22)',
  },
  {
    step: '03 // REALTIME',
    title: 'Live team chat',
    body: 'Each team gets a dedicated low-latency Socket.IO room with system event broadcasts and unread tracking.',
    accent: 'rgba(16, 185, 129, 0.20)',
  },
  {
    step: '04 // HACKATHONS',
    title: 'Hackathon judging',
    body: 'Submit your GitHub repository, get evaluated against a weighted faculty rubric, and watch the live leaderboard.',
    accent: 'rgba(245, 158, 11, 0.20)',
  },
  {
    step: '05 // VERIFIED OD',
    title: 'Verified OD certificates',
    body: 'Download official Duty Leave PDFs stamped with tamper-proof serials and instant public QR verification.',
    accent: 'rgba(236, 72, 153, 0.20)',
  },
] as const;

export default async function LandingPage() {
  if (await getSession()) redirect('/dashboard');
  return (
    <div className="space-y-14 py-8">
      <section className="mx-auto max-w-3xl space-y-6 py-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-1.5 text-xs font-semibold tracking-widest uppercase backdrop-blur-sm">
          <span className="size-2 animate-pulse rounded-full bg-sky-400" />
          <ShinyText text="UNIFIED CAMPUS EVENT INFRASTRUCTURE" speed={3.5} />
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:text-6xl">
          <BlurText text="Every campus event, one place." stagger={0.07} />
        </h1>

        <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-200 drop-shadow-[0_1px_10px_rgba(0,0,0,0.9)] sm:text-lg">
          CampusGrid lets organizers launch and manage fests, symposiums, and hackathons while students register,
          team up, scan in offline, and claim verified OD certificates without spreadsheets.
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

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((item) => (
          <SpotlightCard
            key={item.title}
            spotlightColor={item.accent}
            className="flex flex-col justify-between p-6"
          >
            <div className="space-y-3">
              <span className="inline-block rounded-md bg-white/5 px-2.5 py-1 font-mono text-[11px] font-semibold text-sky-300 ring-1 ring-white/10">
                <DecryptedText text={item.step} animateOn="hover" />
              </span>
              <h3 className="text-lg font-bold tracking-tight text-white">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-300">{item.body}</p>
            </div>
          </SpotlightCard>
        ))}
      </section>
    </div>
  );
}
