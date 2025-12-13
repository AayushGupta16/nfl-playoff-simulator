import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const jitter = (ms: number) => {
  // +/- 20% jitter to avoid thundering herd retries
  const delta = ms * 0.2;
  return Math.max(0, Math.floor(ms + (Math.random() * 2 - 1) * delta));
};

const parseRetryAfterMs = (value: unknown): number | undefined => {
  if (typeof value !== 'string') return undefined;

  // Spec allows either seconds or an HTTP-date.
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds)) return Math.max(0, Math.floor(asSeconds * 1000));

  const asDate = Date.parse(value);
  if (!Number.isFinite(asDate)) return undefined;

  return Math.max(0, asDate - Date.now());
};

class SimpleRateLimiter {
  private readonly queue: Array<() => void> = [];
  private active = 0;
  private lastStart = 0;
  private readonly maxConcurrent: number;
  private readonly minTimeMs: number;

  constructor(maxConcurrent: number, minTimeMs: number) {
    this.maxConcurrent = maxConcurrent;
    this.minTimeMs = minTimeMs;
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        const sinceLast = Date.now() - this.lastStart;
        const wait = Math.max(0, this.minTimeMs - sinceLast);
        if (wait > 0) await sleep(wait);

        this.active++;
        this.lastStart = Date.now();

        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          this.active--;
          this.pump();
        }
      };

      this.queue.push(() => void run());
      this.pump();
    });
  }

  private pump() {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      job?.();
    }
  }
}

/**
 * Shared Kalshi request limiter (process-wide).
 *
 * Why:
 * - `loadData()` runs multiple Kalshi fetchers in parallel.
 * - React StrictMode in dev runs effects twice (can double traffic).
 * - Kalshi can return 429s on bursty traffic; we want a single choke point.
 */
const kalshiLimiter = new SimpleRateLimiter(2, 200);

export async function kalshiGet<T = any>(
  url: string,
  config?: AxiosRequestConfig,
  options?: { retries?: number }
): Promise<AxiosResponse<T>> {
  const retries = options?.retries ?? 5;

  return await kalshiLimiter.schedule(async () => {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await axios.get<T>(url, config);
      } catch (err: any) {
        const status = err?.response?.status;
        const retryAfterHeader =
          err?.response?.headers?.['retry-after'] ?? err?.response?.headers?.['Retry-After'];

        const isRetryable =
          status === 429 || status === 502 || status === 503 || status === 504 || err?.code === 'ECONNABORTED';

        if (!isRetryable || attempt >= retries) throw err;

        const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
        const backoffMs = jitter(Math.min(10_000, 500 * Math.pow(2, attempt)));
        const waitMs = retryAfterMs !== undefined ? Math.max(retryAfterMs, 250) : backoffMs;

        attempt++;
        await sleep(waitMs);
      }
    }
  });
}


