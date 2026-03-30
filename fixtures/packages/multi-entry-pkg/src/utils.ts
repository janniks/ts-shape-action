/**
 * Utility entrypoint
 */

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  return fn().catch((err) => {
    if (attempts <= 1) throw err;
    return retry(fn, attempts - 1);
  });
}
