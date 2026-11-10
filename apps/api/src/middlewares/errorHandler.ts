import type { ErrorResponse } from '@nutrikids/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export const notFoundHandler: RequestHandler = (req, res) => {
  const payload: ErrorResponse = {
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  };
  res.status(404).json(payload);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const payload: ErrorResponse = {
      error: 'Validation Error',
      message: 'Datos de entrada inválidos',
      issues: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
    res.status(400).json(payload);
    return;
  }

  const statusCode =
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : 500;

  const message = err instanceof Error ? err.message : 'Internal Server Error';

  if (statusCode >= 500) {
    console.error('Unhandled error:', err);
  }

  const payload: ErrorResponse = {
    error: statusCode >= 500 ? 'Internal Server Error' : 'Request Error',
    message,
  };
  res.status(statusCode).json(payload);
};
