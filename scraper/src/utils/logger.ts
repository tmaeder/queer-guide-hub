import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logging.level,
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});

export function childLogger(name: string) {
  return logger.child({ source: name });
}
