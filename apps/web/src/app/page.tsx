import { redirect } from 'next/navigation';
import { ButtonLink, Card } from '@/components/ui';
import { getSession } from '@/lib/session';

const FEATURES = [
  ['Register & form teams', 'Sign up for fests, symposiums and hackathons. Build a team with an invite code.'],
  ['Signed QR passes', 'Every registration gets a tamper-proof pass that checks you in in seconds, even offline.'],
  ['Live team chat', 'Each team gets its own real-time chat room the moment it forms.'],
  ['Hackathon judging', 'Submit your GitHub repo, get scored on a weighted rubric, watch the leaderboard live.'],
  ['Verified OD certificates', 'Download Duty Leave certificates anyone can verify with a code.'],
] as const;

export default async function LandingPage() {
  if (await getSession()) redirect('/dashboard');
  return (
    <div className="space-y-10 py-8">
      <section className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Every campus event, one place.</h1>
        <p className="mx-auto max-w-xl text-slate-600">
          CampusGrid lets organizers create and run events and lets students register, team up, check in and get
          certified without the spreadsheets.
        </p>
        <div className="flex justify-center gap-3">
          <ButtonLink href="/register">Get started</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Log in
          </ButtonLink>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([title, body]) => (
          <Card key={title}>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
