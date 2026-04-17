export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  private readonly redactedToken = "[REDACTED]";

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this._log("DEBUG", message, data);
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this._log("INFO", message, data);
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this._log("WARN", message, data);
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      if (error instanceof Error) {
        this._log("ERROR", `${message}: ${error.message}`, error.stack);
      } else {
        this._log("ERROR", message, error);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.level);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  private _log(level: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    const safeMessage = this.sanitizeValue(message);
    const safeData = this.sanitizeData(data);

    if (safeData !== undefined) {
      console.error(`${prefix} ${safeMessage}`, safeData);
    } else {
      console.error(`${prefix} ${safeMessage}`);
    }
  }

  private sanitizeData(value: unknown): unknown {
    if (value === undefined || value === null) return value;
    if (typeof value === "string") return this.sanitizeValue(value);
    if (Array.isArray(value)) return value.map((item) => this.sanitizeData(item));
    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (/(pat|token|api[-_]?key|authorization)/i.test(key)) {
          out[key] = this.redactedToken;
          continue;
        }
        out[key] = this.sanitizeData(item);
      }
      return out;
    }
    return value;
  }

  private sanitizeValue(value: string): string {
    return value
      .replace(/(api[_-]?key\s*[=:]\s*)([^\s,;]+)/gi, `$1${this.redactedToken}`)
      .replace(/(pat\s*[=:]\s*)([^\s,;]+)/gi, `$1${this.redactedToken}`)
      .replace(/(authorization\s*[:=]\s*bearer\s+)([^\s,;]+)/gi, `$1${this.redactedToken}`);
  }
}

export const logger = new Logger();
