import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };

// Phase 0 shell. Phase 1 adds my events, my teams and next event.
export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect('/login?next=/dashboard');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Hi, {user.name}</h1>
      <Card className="text-sm text-slate-600">Your events and teams will show up here.</Card>
    </div>
  );
}
