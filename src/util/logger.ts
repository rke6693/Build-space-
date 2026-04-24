import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';
const pretty = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level,
  base: { service: 'keel' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers.cookie',
      '*.apiKey',
      '*.api_key',
    ],
    censor: '[redacted]',
  },
  ...(pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', singleLine: false },
        },
      }
    : {}),
});

export type Logger = typeof logger;
