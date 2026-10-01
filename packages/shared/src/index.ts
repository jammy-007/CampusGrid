export * from './roles';
export * from './auth';
export * from './events';
export * from './teams';
export * from './passes';
export * from './checkin';
export * from './certificates';
export * from './chat';
export * from './hackathon';

/** Error body every API route returns: HTTP status + { error: { code, message } }. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
