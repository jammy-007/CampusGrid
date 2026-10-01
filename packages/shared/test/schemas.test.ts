import { describe, expect, it } from 'vitest';
import {
  createEventSchema,
  INVITE_CODE_ALPHABET,
  joinTeamSchema,
  registerSchema,
  updateEventSchema,
} from '../src';

const base = {
  title: 'GridHack',
  type: 'HACKATHON',
  venue: 'Hall',
  startsAt: '2026-10-10T09:00:00Z',
  endsAt: '2026-10-11T09:00:00Z',
  registrationDeadline: '2026-10-09T09:00:00Z',
};

describe('shared schemas', () => {
  it('lowercases emails and requires 8+ char passwords', () => {
    const ok = registerSchema.parse({ institutionSlug: 'bmsit', name: 'A', email: 'A@B.EDU', password: '12345678' });
    expect(ok.email).toBe('a@b.edu');
    expect(registerSchema.safeParse({ institutionSlug: 'x', name: 'A', email: 'a@b.edu', password: 'short' }).success).toBe(
      false,
    );
  });

  it('applies event defaults on create and coerces dates', () => {
    const e = createEventSchema.parse(base);
    expect(e).toMatchObject({ isTeamEvent: false, minTeamSize: 1, maxTeamSize: 1, description: '' });
    expect(e.startsAt).toBeInstanceOf(Date);
  });

  it('rejects inverted dates and team sizes', () => {
    expect(createEventSchema.safeParse({ ...base, endsAt: '2026-10-09T00:00:00Z' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, registrationDeadline: '2026-10-12T00:00:00Z' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, minTeamSize: 4, maxTeamSize: 2 }).success).toBe(false);
  });

  it('does not inject defaults into PATCH bodies', () => {
    expect(updateEventSchema.parse({ title: 'New' })).toEqual({ title: 'New' });
  });

  it('normalises invite codes and rejects look-alike characters', () => {
    expect(joinTeamSchema.parse({ inviteCode: ' abcd2345 ' }).inviteCode).toBe('ABCD2345');
    expect(joinTeamSchema.safeParse({ inviteCode: 'ABCD0O1I' }).success).toBe(false);
    expect(INVITE_CODE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(INVITE_CODE_ALPHABET).toHaveLength(32);
  });
});
