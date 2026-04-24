export type KeelErrorCode =
  | 'auth_missing'
  | 'auth_invalid'
  | 'budget_exceeded'
  | 'rate_limited'
  | 'payload_too_large'
  | 'bad_request'
  | 'upstream_error'
  | 'upstream_timeout'
  | 'no_healthy_provider'
  | 'not_found'
  | 'internal';

export class KeelError extends Error {
  readonly code: KeelErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: KeelErrorCode,
    message: string,
    opts: { status?: number; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.code = code;
    this.status = opts.status ?? defaultStatusFor(code);
    this.details = opts.details;
    this.name = 'KeelError';
  }
}

function defaultStatusFor(code: KeelErrorCode): number {
  switch (code) {
    case 'auth_missing':
    case 'auth_invalid':
      return 401;
    case 'budget_exceeded':
      return 402;
    case 'rate_limited':
      return 429;
    case 'payload_too_large':
      return 413;
    case 'bad_request':
      return 400;
    case 'not_found':
      return 404;
    case 'upstream_timeout':
      return 504;
    case 'upstream_error':
    case 'no_healthy_provider':
      return 502;
    case 'internal':
      return 500;
  }
}
