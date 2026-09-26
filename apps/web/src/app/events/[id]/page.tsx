import { EventPassButton } from '@/features/checkin';
import { HackathonPanel } from '@/features/hackathon';
import { Card } from '@/components/ui';

// Phase 0 shell: renders the Agent 2 and Agent 4 slots. Phase 1 adds event details,
// register / create team / join team, and only shows the slots when they apply.
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Event</h1>
      <Card className="text-sm text-slate-600">Event details are coming in Phase 1.</Card>
      <EventPassButton registrationId="" />
      <HackathonPanel eventId={id} />
    </div>
  );
}
