import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { KeelError } from '../../util/errors.js';
import { logger } from '../../util/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof KeelError) {
    logger.warn(
      { code: err.code, status: err.status, details: err.details },
      `keel error: ${err.message}`,
    );
    return c.json(
      {
        error: {
          type: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      err.status as ContentfulStatusCode,
    );
  }

  logger.error({ err }, 'unhandled error');
  return c.json(
    { error: { type: 'internal', message: 'internal server error' } },
    500,
  );
};
