import pino from 'pino'
import { config } from './config.js'

const baseOptions: pino.LoggerOptions = { level: config.logLevel }

if (config.nodeEnv !== 'production') {
  baseOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, ignore: 'pid,hostname', translateTime: 'SYS:standard' },
  }
}

export const logger = pino(baseOptions)

export function createChildLogger(name: string) {
  return logger.child({ source: name })
}
