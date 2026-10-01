import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import type { ApiErrorBody } from '@campusgrid/shared';
import { HttpError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = { error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong' } };

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    status = 404;
    body = { error: { code: 'NOT_FOUND', message: 'Not found' } };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    status = 409;
    body = { error: { code: 'CONFLICT', message: 'That already exists' } };
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    body = { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } };
  } else {
    console.error(err);
  }

  res.status(status).json(body);
};
