/**
 * Classified scraper errors.
 *
 * engine.js throws these instead of letting raw Playwright/DOM errors
 * bubble up as-is, so that worker.js / availabilityController.js can
 * surface a stable, user-facing message (and a `code` for logging/alerts)
 * instead of an internal stack-trace string.
 */
export class ScraperError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ScraperError';
    this.code = code;
  }
}
