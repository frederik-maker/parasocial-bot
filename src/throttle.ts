/**
 * Shared rate limiter for ALL Zerion calls (CLI + REST).
 * Free tier = 1 req/sec; 1100ms gap gives us safety margin.
 */
const MIN_GAP_MS = 1500;

let chain: Promise<void> = Promise.resolve();
let lastRunAt = 0;

export async function zerionThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = lastRunAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRunAt = Date.now();
  });
  chain = next.catch(() => undefined);
  await next;
  return fn();
}
