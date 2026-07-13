/**
 * Core Playwright scraper engine.
 * Handles Amazon.in and Flipkart.com product availability checks
 * across multiple PIN codes in a single session.
 */

import { chromium } from 'playwright';
import { getRandomUserAgent, sleep, applyStealth } from './mitigations.js';
import { PLATFORMS, selectors } from './parsers.js';
import { registerFailure } from '../monitoring/alerts.js';

export async function scrapeProductAvailability(url, platform, productId, pincodes) {
  if (!pincodes || pincodes.length === 0) return [];

  console.log(`Starting scraper session for ${platform.toUpperCase()} product ${productId}. Target PINs: ${pincodes.join(', ')}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1366, height: 768 },
    locale: 'en-IN',
    geolocation: { latitude: 28.6139, longitude: 77.2090 }, // Delhi
    permissions: ['geolocation'],
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9',
    },
  });

  const page = await context.newPage();
  await applyStealth(page);

  const results = [];

  try {
    console.log(`Navigating to target URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1500, 2500);

    // Dismiss any initial modals/popups
    await dismissInitialModals(page, platform);

    // Extract product title
    let productTitle = 'Unknown Product';
    try {
      if (platform === PLATFORMS.AMAZON) {
        const titleEl = await page.$('#productTitle, #title');
        if (titleEl) productTitle = (await titleEl.textContent()).trim();
      } else if (platform === PLATFORMS.FLIPKART) {
        const titleEl = await page.$('span.B_NuCI, h1.yhB1nd, span.VU-ZEz, h1');
        if (titleEl) productTitle = (await titleEl.textContent()).trim();
      }
    } catch (e) {
      console.warn(`Could not extract product title: ${e.message}`);
    }

    console.log(`Product title: ${productTitle}`);

    for (const pin of pincodes) {
      const timestamp = new Date();
      console.log(`[${productId} - ${pin}] Checking availability...`);

      try {
        let result;
        if (platform === PLATFORMS.AMAZON) {
          result = await checkAmazonPin(page, pin, productId);
        } else if (platform === PLATFORMS.FLIPKART) {
          result = await checkFlipkartPin(page, pin, productId);
        } else {
          throw new Error(`Unsupported platform: ${platform}`);
        }

        console.log(`[${productId} - ${pin}] Result: ${result.status} | Delivery: ${result.deliveryDate || 'N/A'}`);

        results.push({
          productId,
          productTitle,
          pincode: pin,
          status: result.status,
          deliveryDate: result.deliveryDate,
          scrapedAt: timestamp,
        });

      } catch (error) {
        const errorMessage = error.message || 'Unknown scraping error';
        console.error(`[SCRAPE FAILURE] Product: ${productId}, PIN: ${pin}, Error: ${errorMessage}`);
        registerFailure(productId, pin);

        results.push({
          productId,
          productTitle,
          pincode: pin,
          status: "Couldn't verify",
          deliveryDate: null,
          scrapedAt: timestamp,
          error: errorMessage,
        });

        // Try to recover session by re-navigating
        try {
          if (errorMessage.includes('navigation') || errorMessage.includes('Target closed') || errorMessage.includes('context')) {
            console.log('Session crash detected. Re-navigating...');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await sleep(1000, 2000);
          }
        } catch (reloadErr) {
          console.error(`Failed to reload: ${reloadErr.message}`);
        }
      }
    }

  } catch (globalError) {
    console.error(`CRITICAL: Global session error for ${productId}: ${globalError.message}`);
    for (const pin of pincodes) {
      if (!results.find(r => r.pincode === pin)) {
        results.push({
          productId,
          productTitle: 'Unknown Product',
          pincode: pin,
          status: "Couldn't verify",
          deliveryDate: null,
          scrapedAt: new Date(),
          error: `Session crash: ${globalError.message}`,
        });
        registerFailure(productId, pin);
      }
    }
  } finally {
    await browser.close();
    console.log(`Scraper session closed for product ${productId}.`);
  }

  return results;
}

/**
 * Dismiss login/cookie modals on first load.
 */
async function dismissInitialModals(page, platform) {
  try {
    if (platform === PLATFORMS.AMAZON) {
      // Dismiss possible "Sign in" or cookie dialog
      const dismissBtn = page.locator('#nav-main a.nav-a, #dismiss-button, [data-action="a-popover-close"]').first();
      if (await dismissBtn.isVisible({ timeout: 2000 })) {
        await dismissBtn.click({ force: true });
        await sleep(300, 600);
      }
    } else if (platform === PLATFORMS.FLIPKART) {
      // Dismiss Flipkart login popup
      const closeBtn = page.locator('button._2KpZ6l._2doB4z, span._30XB9F').first();
      if (await closeBtn.isVisible({ timeout: 2000 })) {
        await closeBtn.click();
        await sleep(300, 600);
      }
    }
  } catch (_) { /* ignore */ }
}

/**
 * Amazon: Change PIN code and read availability.
 * Uses a robust multi-strategy approach.
 */
async function checkAmazonPin(page, pin, productId) {
  // ---- Strategy 1: Try the location slot widget ----
  try {
    const widget = page.locator('#nav-global-location-slot, #glow-ingress-block').first();
    if (await widget.isVisible({ timeout: 3000 })) {
      await widget.click({ force: true });
      await sleep(800, 1500);
    }
  } catch (_) { /* ignore if not found */ }

  // Wait for the PIN input to appear
  const pincodeInput = page.locator('input#GLUXZipUpdateInput');
  try {
    await pincodeInput.waitFor({ state: 'visible', timeout: 6000 });
  } catch (e) {
    throw new Error(`PIN input not visible after clicking location widget: ${e.message}`);
  }

  // Clear and type the PIN
  await pincodeInput.click({ clickCount: 3 }); // triple-click selects all
  await pincodeInput.fill('');
  await sleep(200, 400);
  await pincodeInput.type(pin, { delay: 80 });
  await sleep(400, 800);

  // Click Apply/Submit button
  const submitBtn = page.locator('#GLUXZipUpdate input[type="submit"], input.a-button-input[aria-labelledby="GLUXZipUpdate-announce"]').first();
  try {
    await submitBtn.waitFor({ state: 'visible', timeout: 3000 });
    await submitBtn.click({ force: true });
  } catch (_) {
    // Try pressing Enter as fallback
    await pincodeInput.press('Enter');
  }

  await sleep(800, 1500);

  // Click "Done" button if it appears
  try {
    const doneBtn = page.locator('button[name="glowDoneButton"], #GLUXConfirmClose').first();
    if (await doneBtn.isVisible({ timeout: 3000 })) {
      await doneBtn.click();
      await sleep(500, 1000);
    }
  } catch (_) { /* no done button */ }

  // Wait for page to update with new location
  try {
    await page.waitForFunction(
      (pinCode) => {
        const el = document.querySelector('#glow-ingress-line2') ||
          document.querySelector('.nav-line-2') ||
          document.querySelector('#nav-global-location-slot');
        return el && el.textContent && el.textContent.includes(pinCode.substring(0, 3));
      },
      pin,
      { timeout: 8000 }
    );
  } catch (_) {
    // Don't fail here — Amazon sometimes doesn't show the PIN in widget but location IS updated
    console.warn(`[${productId} - ${pin}] Location widget didn't reflect PIN but continuing...`);
    await sleep(1000, 2000);
  }

  // Wait for availability section
  try {
    await page.waitForSelector('#availability, #ddmDeliveryMessage, #deliveryBlockMessage, #mir-layout-DELIVERY_BLOCK', {
      state: 'attached',
      timeout: 8000,
    });
  } catch (_) {
    await sleep(1000, 2000); // Just wait a bit more
  }

  return await parseAmazonAvailability(page);
}

/**
 * Parse Amazon availability from the current page state.
 */
async function parseAmazonAvailability(page) {
  let status = 'Unavailable';
  let deliveryDate = null;

  // Collect all relevant text
  const allText = await page.evaluate(() => {
    const selectors = [
      '#availability',
      '#ddmDeliveryMessage',
      '#deliveryBlockMessage',
      '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE',
      '#fast-track-message',
      '#outOfStock',
      '#exports_desktop_qualifiedBuybox_desktop_div',
      '#buybox',
    ];
    return selectors
      .flatMap(sel => Array.from(document.querySelectorAll(sel)))
      .map(el => el.innerText || el.textContent || '')
      .join(' ')
      .toLowerCase();
  });

  console.log(`[Amazon] Availability text snippet: "${allText.substring(0, 200)}"`);

  const outOfStockPhrases = [
    'currently unavailable',
    'out of stock',
    'we don\'t know when or if',
    'cannot be delivered to this location',
    'not deliverable',
    'does not deliver to',
    'unavailable',
    'we don\'t ship this item',
  ];

  const availablePhrases = [
    'in stock',
    'only',
    'left in stock',
    'delivery',
    'get it by',
    'get it as soon as',
    'ships from',
    'sold by',
    'add to cart',
  ];

  const isOut = outOfStockPhrases.some(k => allText.includes(k));
  const isAvailable = availablePhrases.some(k => allText.includes(k));

  if (isOut && !isAvailable) {
    status = 'Unavailable';
  } else if (isAvailable || (!isOut && allText.length > 20)) {
    status = 'Available';
    // Extract delivery date text
    try {
      const dateText = await page.evaluate(() => {
        const dateSelectors = [
          '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE',
          '#ddmDeliveryMessage',
          '#fast-track-message',
          '#upsell-message',
          '#deliveryBlockMessage',
          '#delivery-message',
        ];
        for (const sel of dateSelectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText && el.innerText.trim()) {
            return el.innerText.replace(/\s+/g, ' ').trim();
          }
        }
        return null;
      });
      if (dateText) deliveryDate = dateText;
    } catch (_) {
      deliveryDate = 'Standard Delivery';
    }
  } else {
    // Empty or ambiguous — treat as unable to verify
    throw new Error('Could not determine availability: page content insufficient');
  }

  return { status, deliveryDate };
}

/**
 * Flipkart: Change PIN code and read availability.
 */
async function checkFlipkartPin(page, pin, productId) {
  // Try to find and clear the pincode input
  let input = page.locator('input#pincodeInputId').first();

  if (!(await input.isVisible({ timeout: 3000 }).catch(() => false))) {
    // Try clicking "Deliver to" or similar openers
    const openers = page.locator('div._3X230a, div.ld-VE3, div._2afOB6, [class*="pincode"]').first();
    try {
      if (await openers.isVisible({ timeout: 2000 })) {
        await openers.click();
        await sleep(500, 1000);
      }
    } catch (_) { /* ignore */ }
    input = page.locator('input#pincodeInputId, input[placeholder*="Enter pincode"], input[placeholder*="Pincode"]').first();
  }

  await input.scrollIntoViewIfNeeded({ timeout: 4000 });
  await input.click({ clickCount: 3 });
  await input.fill('');
  await sleep(200, 400);
  await input.type(pin, { delay: 80 });
  await sleep(400, 700);

  // Click "Check" button
  const checkBtn = page.locator('p.s1Q9rs, span._2PciBh, p._2RQLHD, span.y305Xq, div._3X230a span').first();
  try {
    if (await checkBtn.isVisible({ timeout: 2000 })) {
      await checkBtn.click();
    } else {
      await input.press('Enter');
    }
  } catch (_) {
    await input.press('Enter');
  }

  // Wait for delivery info to update
  try {
    await page.waitForSelector('div._3X230a, div._1TP2go, div.NY1eFD, div._3XINqE', {
      state: 'visible',
      timeout: 6000,
    });
  } catch (_) {
    await sleep(1000, 2000);
  }

  return await parseFlipkartAvailability(page);
}

/**
 * Parse Flipkart availability.
 */
async function parseFlipkartAvailability(page) {
  let status = 'Unavailable';
  let deliveryDate = null;

  const allText = await page.evaluate(() => {
    const selectors = [
      'div._3X230a',
      'div._1TP2go',
      'div.NY1eFD',
      'div._2NjOI7',
      'div._3XINqE',
      'div[class*="delivery"]',
      'div[class*="Delivery"]',
    ];
    return selectors
      .flatMap(sel => Array.from(document.querySelectorAll(sel)))
      .map(el => el.innerText || el.textContent || '')
      .join(' ')
      .toLowerCase();
  });

  console.log(`[Flipkart] Delivery text snippet: "${allText.substring(0, 200)}"`);

  const outPhrases = ['not deliverable', 'out of stock', 'currently unavailable', 'not available', 'no seller delivering'];
  const inPhrases = ['delivery by', 'delivered by', 'standard delivery', 'tomorrow', 'today', 'days', 'free delivery'];

  const isOut = outPhrases.some(k => allText.includes(k));
  const isIn = inPhrases.some(k => allText.includes(k));

  if (isOut) {
    status = 'Unavailable';
  } else if (isIn) {
    status = 'Available';
    try {
      deliveryDate = await page.evaluate(() => {
        const el = document.querySelector('div._3X230a, div.NY1eFD, div._1TP2go');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
      });
    } catch (_) {
      deliveryDate = 'Standard Delivery';
    }
  } else {
    throw new Error('Flipkart: Could not determine delivery status');
  }

  return { status, deliveryDate };
}
