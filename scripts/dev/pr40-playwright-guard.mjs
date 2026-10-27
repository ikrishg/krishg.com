/**
 * Bounded Playwright waits and prove assertions (no uncaught harness timeouts).
 */
export class ProveAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProveAssertionError";
  }
}

export function assertProve(condition, message) {
  if (!condition) throw new ProveAssertionError(message);
}

export function isPageOrTargetClosedError(err) {
  const msg = String(err?.message ?? err);
  return (
    msg.includes("Target page, context or browser has been closed") ||
    msg.includes("Target closed") ||
    msg.includes("has been closed")
  );
}

/**
 * Retry page.waitForFunction; on exhaustion throw ProveAssertionError (never raw timeout).
 */
export async function waitForPageCondition(
  page,
  pageFunction,
  {
    timeoutMs = 20_000,
    retries = 3,
    label = "waitForPageCondition",
    arg,
  } = {},
) {
  if (page.isClosed()) {
    throw new ProveAssertionError(`${label}: page is closed before wait`);
  }
  let lastMessage = "";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (arg !== undefined) {
        await page.waitForFunction(pageFunction, arg, { timeout: timeoutMs });
      } else {
        await page.waitForFunction(pageFunction, { timeout: timeoutMs });
      }
      return;
    } catch (err) {
      lastMessage = err?.message ?? String(err);
      if (page.isClosed()) {
        throw new ProveAssertionError(
          `${label}: page closed during wait (attempt ${attempt}/${retries})`,
        );
      }
      if (attempt < retries) {
        await page.waitForTimeout(Math.min(500, 150 * attempt));
      }
    }
  }
  throw new ProveAssertionError(
    `${label}: timed out after ${retries}×${timeoutMs}ms — ${lastMessage}`,
  );
}
