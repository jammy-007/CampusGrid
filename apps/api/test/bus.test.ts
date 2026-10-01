import { afterEach, describe, expect, it, vi } from 'vitest';
import { bus } from '../src/lib/bus';

describe('bus', () => {
  afterEach(() => bus.removeAllListeners());

  it('delivers typed payloads and unsubscribes', () => {
    const seen: string[] = [];
    const off = bus.on('team.created', (p) => void seen.push(`${p.teamId}:${p.eventId}:${p.leaderId}`));
    bus.emit('team.created', { teamId: 't', eventId: 'e', leaderId: 'u' });
    off();
    bus.emit('team.created', { teamId: 't2', eventId: 'e', leaderId: 'u' });
    expect(seen).toEqual(['t:e:u']);
  });

  it('isolates failing listeners from the emitter and other listeners', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn();
    bus.on('registration.cancelled', () => {
      throw new Error('boom');
    });
    bus.on('registration.cancelled', async () => {
      throw new Error('async boom');
    });
    bus.on('registration.cancelled', ok);
    expect(() => bus.emit('registration.cancelled', { registrationId: 'r' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(ok).toHaveBeenCalledWith({ registrationId: 'r' });
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
