// Owned by Agent 2. Phase 0 placeholder rendered by /events/[id]; replace with the real pass button.
import { Button } from '@/components/ui';

export function EventPassButton({ registrationId }: { registrationId: string }) {
  return (
    <Button variant="secondary" disabled data-registration-id={registrationId}>
      Event pass (coming soon)
    </Button>
  );
}
