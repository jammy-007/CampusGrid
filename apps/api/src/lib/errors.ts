/** Throw from any handler; middleware/error.ts turns it into the contract error shape. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) =>
  new HttpError(400, code, message, details);
export const unauthorized = (message = 'Sign in to continue', code = 'UNAUTHORIZED') =>
  new HttpError(401, code, message);
export const forbidden = (message = 'You do not have access to this', code = 'FORBIDDEN') =>
  new HttpError(403, code, message);
export const notFound = (message = 'Not found', code = 'NOT_FOUND') => new HttpError(404, code, message);
export const conflict = (message: string, code = 'CONFLICT') => new HttpError(409, code, message);
