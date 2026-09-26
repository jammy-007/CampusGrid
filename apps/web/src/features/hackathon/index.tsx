// Owned by Agent 4. Phase 0 placeholder rendered by /events/[id] for hackathons.
import { Card } from '@/components/ui';

export function HackathonPanel({ eventId }: { eventId: string }) {
  return (
    <Card data-event-id={eventId} className="text-sm text-slate-500">
      Hackathon submissions and leaderboard are coming soon.
    </Card>
  );
}
