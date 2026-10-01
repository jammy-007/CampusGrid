import type { z } from 'zod';
import { badRequest } from './errors';

/** Parses input with a zod schema or throws a 400 VALIDATION_ERROR with field issues. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : 'Invalid input';
    throw badRequest(message, 'VALIDATION_ERROR', issues);
  }
  return result.data;
}
