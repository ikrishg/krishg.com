let lastIdleFlushRenders = 0;

export function recordR3fFlushRenderCount(count: number) {
  lastIdleFlushRenders = count;
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    (window as Window & { __KRISH_R3F_FLUSH?: number }).__KRISH_R3F_FLUSH =
      count;
  }
}

export function getLastR3fFlushRenderCount() {
  return lastIdleFlushRenders;
}
