import { EventEmitter } from 'node:events';

/** Every internal event in docs/CONTRACT.md and its payload. */
export interface BusEvents {
  'team.created': { teamId: string; eventId: string; leaderId: string };
  'team.member_joined': { teamId: string; userId: string };
  'team.member_left': { teamId: string; userId: string };
  'registration.created': { registrationId: string; eventId: string; userId: string };
  'registration.cancelled': { registrationId: string };
  'checkin.recorded': { eventId: string; registrationId: string; scannedAt: Date };
  'score.updated': { eventId: string; submissionId: string };
}

export type BusEventName = keyof BusEvents;
export type BusListener<K extends BusEventName> = (payload: BusEvents[K]) => void | Promise<void>;

/**
 * Typed in-process event bus. Listeners run after the emitting request's DB work;
 * a throwing or rejecting listener is logged and never breaks the emitter.
 */
class Bus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends BusEventName>(event: K, listener: BusListener<K>): () => void {
    const wrapped = (payload: BusEvents[K]) => {
      try {
        const result = listener(payload);
        if (result instanceof Promise) {
          result.catch((err: unknown) => console.error(`[bus] ${event} listener failed`, err));
        }
      } catch (err) {
        console.error(`[bus] ${event} listener failed`, err);
      }
    };
    this.emitter.on(event, wrapped);
    return () => this.emitter.off(event, wrapped);
  }

  emit<K extends BusEventName>(event: K, payload: BusEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

export const bus = new Bus();
