import pino from 'pino';

// Structured JSON logs. Redact known PII/secret fields so they never hit stdout.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.secret',
      'email',
      '*.email',
    ],
    censor: '[redacted]',
  },
  base: { svc: 'space-runner-saas' },
});
