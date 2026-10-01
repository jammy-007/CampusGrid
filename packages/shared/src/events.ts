import { z } from 'zod';

export const EVENT_TYPES = ['FEST', 'SYMPOSIUM', 'HACKATHON', 'WORKSHOP'] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof eventTypeSchema>;

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED'] as const;
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const REGISTRATION_STATUSES = ['CONFIRMED', 'CANCELLED'] as const;
export const registrationStatusSchema = z.enum(REGISTRATION_STATUSES);
export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;

// No defaults here: PATCH must not reset omitted fields.
const eventFields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000),
  type: eventTypeSchema,
  venue: z.string().trim().min(1).max(200),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  registrationDeadline: z.coerce.date(),
  isTeamEvent: z.boolean(),
  minTeamSize: z.number().int().min(1).max(20),
  maxTeamSize: z.number().int().min(1).max(20),
  capacity: z.number().int().positive().nullable(),
});

type EventFieldsShape = Partial<z.infer<typeof eventFields>>;

function checkEventRules(e: EventFieldsShape, ctx: z.RefinementCtx) {
  if (e.startsAt && e.endsAt && e.endsAt < e.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must be after start' });
  }
  if (e.endsAt && e.registrationDeadline && e.registrationDeadline > e.endsAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['registrationDeadline'],
      message: 'Registration deadline must be on or before the end',
    });
  }
  if (e.minTeamSize !== undefined && e.maxTeamSize !== undefined && e.minTeamSize > e.maxTeamSize) {
    ctx.addIssue({ code: 'custom', path: ['maxTeamSize'], message: 'Max team size must be ≥ min team size' });
  }
}

export const createEventSchema = eventFields
  .extend({
    description: eventFields.shape.description.default(''),
    isTeamEvent: eventFields.shape.isTeamEvent.default(false),
    minTeamSize: eventFields.shape.minTeamSize.default(1),
    maxTeamSize: eventFields.shape.maxTeamSize.default(1),
    capacity: eventFields.shape.capacity.optional(),
  })
  .superRefine(checkEventRules);
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** PATCH body: any subset of fields, plus status moves (see EVENT_STATUS_FLOW). */
export const updateEventSchema = eventFields
  .partial()
  .extend({ status: eventStatusSchema.optional() })
  .superRefine(checkEventRules);
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Allowed forward status moves: DRAFT → PUBLISHED → ONGOING → COMPLETED. */
export const EVENT_STATUS_FLOW: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ONGOING'],
  ONGOING: ['COMPLETED'],
  COMPLETED: [],
};

export const eventListQuerySchema = z.object({
  type: eventTypeSchema.optional(),
  when: z.enum(['upcoming', 'past']).optional(),
  mine: z.enum(['true', 'false']).optional(),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export interface EventDTO {
  id: string;
  institutionId: string;
  organizerId: string;
  organizerName?: string;
  title: string;
  description: string;
  type: EventType;
  venue: string;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  isTeamEvent: boolean;
  minTeamSize: number;
  maxTeamSize: number;
  capacity: number | null;
  status: EventStatus;
  createdAt: string;
  registeredCount?: number;
  /** The caller's own registration, when signed in. */
  myRegistration?: MyRegistrationDTO | null;
}

export interface MyRegistrationDTO {
  id: string;
  status: RegistrationStatus;
  teamId: string | null;
}

export interface RegistrationDTO {
  id: string;
  eventId: string;
  userId: string;
  teamId: string | null;
  status: RegistrationStatus;
  createdAt: string;
  user?: { id: string; name: string; email: string; usn: string | null };
  team?: { id: string; name: string } | null;
  event?: EventDTO;
}
