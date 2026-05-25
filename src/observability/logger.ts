type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export class Logger {
  constructor(private readonly minLevel: LogLevel = 'info') {}

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel]
  }

  private emit(
    level: LogLevel,
    message: string,
    fields?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(level)) return
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...fields,
    }
    const line = JSON.stringify(entry)
    if (level === 'error') {
      console.error(line)
    } else {
      console.log(line)
    }
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.emit('debug', msg, fields)
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.emit('info', msg, fields)
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.emit('warn', msg, fields)
  }
  error(msg: string, fields?: Record<string, unknown>): void {
    this.emit('error', msg, fields)
  }
}
