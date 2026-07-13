import dotenv from 'dotenv';

dotenv.config();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const FAILURE_THRESHOLD = 0.3; // 30% failure rate triggers alert
const MIN_ATTEMPTS = 10; // Minimum checks to evaluate threshold

// In-memory sliding window for tracking recent scrape events
const eventWindow = [];
const WINDOW_SIZE = 50; // Keep track of last 50 attempts

/**
 * Registers a successful scrape attempt.
 */
export function registerSuccess(productId, pincode) {
  recordEvent({ productId, pincode, success: true });
}

/**
 * Registers a failed scrape attempt.
 */
export function registerFailure(productId, pincode) {
  recordEvent({ productId, pincode, success: false });
}

function recordEvent(event) {
  eventWindow.push({ ...event, timestamp: new Date() });
  
  // Truncate list to window size
  if (eventWindow.length > WINDOW_SIZE) {
    eventWindow.shift();
  }

  evaluateAlerts();
}

/**
 * Computes failure rate and triggers alert if necessary.
 */
async function evaluateAlerts() {
  if (eventWindow.length < MIN_ATTEMPTS) {
    return;
  }

  const failures = eventWindow.filter(e => !e.success).length;
  const total = eventWindow.length;
  const failureRate = failures / total;

  if (failureRate >= FAILURE_THRESHOLD) {
    const message = `[ALERT] High Scraper Failure Rate: ${(failureRate * 100).toFixed(1)}% (${failures}/${total} checks failed in sliding window). E-commerce selectors may have broken!`;
    console.error(message);
    await triggerSlackNotification(message);
  }
}

/**
 * Sends a notification to Slack if webhook is configured, otherwise logs it.
 */
async function triggerSlackNotification(message) {
  if (!SLACK_WEBHOOK_URL) {
    console.log('[ALERT LOG] (Slack notification skipped - SLACK_WEBHOOK_URL not set)');
    return;
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *Regional Product Availability Tracker Alert* 🚨\n${message}\nTimestamp: ${new Date().toISOString()}`,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to trigger Slack notification: ${response.statusText}`);
    } else {
      console.log('Slack notification triggered successfully.');
    }
  } catch (error) {
    console.error(`Error sending Slack alert: ${error.message}`);
  }
}

/**
 * Returns current metrics for the monitoring dashboard or status APIs.
 */
export function getScraperMetrics() {
  const total = eventWindow.length;
  const failures = eventWindow.filter(e => !e.success).length;
  const successRate = total > 0 ? ((total - failures) / total) * 100 : 100;
  
  return {
    totalAttempts: total,
    failures,
    successRate: `${successRate.toFixed(1)}%`,
    events: eventWindow,
  };
}
