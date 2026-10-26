export interface RetryOptions {
  retries?: number; // number of retries after the first attempt
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  onRetry?: (info: { attempt: number; error: unknown; delayMs: number }) => void | Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function backoffDelay(attempt: number, base: number, factor: number, max: number): number {
  return Math.min(max, base * Math.pow(factor, attempt - 1));
}

/**
 * Runs fn with exponential backoff. attempt numbers passed to fn start at 1.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const factor = opts.factor ?? 2;
  const max = opts.maxDelayMs ?? 8000;
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const retryable =
        !(error instanceof NonRetryableError) && (opts.shouldRetry ? opts.shouldRetry(error) : true);
      if (!retryable || attempt > retries) break;
      let delayMs = backoffDelay(attempt, base, factor, max);
      if (opts.jitter !== false) delayMs = Math.round(delayMs * (0.75 + Math.random() * 0.5));
      if (opts.onRetry) await opts.onRetry({ attempt, error, delayMs });
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
