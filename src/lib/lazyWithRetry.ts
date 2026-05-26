import { lazy, type ComponentType } from 'react';

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
  interval = 500
) {
  return lazy(() => retry(factory, retries, interval));
}

async function retry<T>(
  fn: () => Promise<T>,
  retries: number,
  interval: number,
  attempt = 1
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= retries) throw err;
    await new Promise((r) => setTimeout(r, interval));
    return retry(fn, retries, interval, attempt + 1);
  }
}
