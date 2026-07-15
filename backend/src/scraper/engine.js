/**
 * Core Playwright scraper engine.
 * Runs pincodes checking with concurrency limits to prevent memory crashes on 512MB RAM hosts.
 */

import { chromium } from 'playwright';
import pLimit from 'p-limit';
import { getRandomUserAgent, sleep, applyStealth } from './mitigations.js';
import { PLATFORMS, selectors } from './parsers.js';
import { registerFailure } from '../monitoring/alerts.js';
import { ScraperError } from './errors.js';

// Concurrency limit for target-platform tabs (default 2 to protect low-RAM host environment)
const SCRAPER_CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY || '2', 10);

export async function scrapeProductAvailability(url, platform, productId, pincodes, onResult = null) {
  if (!pincodes || pincodes.length === 0) return [];

  console.log(`[PARALLEL] Starting scraper for ${platform.toUpperCase()} ${productId} | Total PINs: ${pincodes.length} (Concurrency: ${SCRAPER_CONCURRENCY})`);

  // One shared browser instance
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-dev-shm-usage', // Critical flag for low-RAM/containerized hosts to prevent /dev/shm OOM
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--disable-default-apps',
      '--mute-audio',
      '--no-first-run',
      '--disable-gpu',
      '--log-level=3',
      '--disable-logging',
    ],
  });

  // ── Step 1: Fetch product title in one quick pass ────────────────────────
  let productTitle = 'Unknown Product';
  try {
    const titleCtx = await browser.newContext({ userAgent: getRandomUserAgent(), locale: 'en-IN' });
    const titlePage = await titleCtx.newPage();
    await blockResources(titlePage);
    await titlePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (platform === PLATFORMS.AMAZON) {
      const el = await titlePage.$('#productTitle, #title');
      if (el) productTitle = (await el.textContent()).trim();
    } else if (platform === PLATFORMS.FLIPKART) {
      const el = await titlePage.$('span.B_NuCI, h1.yhB1nd, span.VU-ZEz, h1');
      if (el) productTitle = (await el.textContent()).trim();
    }
    await titleCtx.close();
    console.log(`Product title: ${productTitle}`);
  } catch (e) {
    console.warn(`Could not fetch product title: ${e.message}`);
  }

  // ── Step 2: Concurrency-limited parallel execution using p-limit ────────
  const limit = pLimit(SCRAPER_CONCURRENCY);
  const results = [];

  const tasks = pincodes.map((pin, idx) => {
    return limit(async () => {
      const timestamp = new Date();
      
      // Stagger job execution to avoid simultaneous requests (concurrency burst) hitting e-commerce servers at once,
      // which triggers anti-bot/CAPTCHA blocks. We use a tiny 250ms stagger to keep execution extremely fast.
      if (idx > 0) {
        const staggerTime = idx * 250 + Math.floor(Math.random() * 150);
        await sleep(staggerTime);
      }

      console.log(`[${productId} - ${pin}] Concurrency job checking...`);

      let ctx;
      try {
        ctx = await browser.newContext({
          userAgent: getRandomUserAgent(),
          viewport: { width: 1366, height: 768 },
          locale: 'en-IN',
          geolocation: { latitude: 28.6139, longitude: 77.2090 },
          permissions: ['geolocation'],
          extraHTTPHeaders: { 'Accept-Language': 'en-IN,en;q=0.9' },
        });

        const page = await ctx.newPage();
        await applyStealth(page);
        await blockResources(page);

        console.log(`[${productId} - ${pin}] Navigating page to product URL...`);
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        if (response && response.status() === 404) {
          throw new ScraperError('Product page not found (404). Please verify the product URL.', 'NOT_FOUND');
        }

        // Early CAPTCHA block check
        const parser = selectors[platform];
        const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
        if (parser && parser.captchaMarkers && parser.captchaMarkers.some((marker) => bodyText.includes(marker))) {
          const platformLabel = platform === PLATFORMS.AMAZON ? 'Amazon' : 'Flipkart';
          throw new ScraperError(`${platformLabel} blocked the scraper (Robot / CAPTCHA page detected). Please try again later.`, 'BLOCKED');
        }

        // Sanity check that the actual product page rendered
        if (parser && parser.titleSelector) {
          try {
            await page.locator(parser.titleSelector).first().waitFor({ state: 'visible', timeout: 10000 });
          } catch {
            throw new ScraperError('Product title element not found or page took too long to load', 'TITLE_NOT_FOUND');
          }
        }

        await sleep(800, 1200);
        await dismissInitialModals(page, platform);

        let result;
        if (platform === PLATFORMS.AMAZON) {
          result = await checkAmazonPin(page, pin, productId, url);
        } else if (platform === PLATFORMS.FLIPKART) {
          result = await checkFlipkartPin(page, pin, productId);
        } else {
          throw new ScraperError(`Unsupported platform: ${platform}`, 'UNSUPPORTED_PLATFORM');
        }

        console.log(`[${productId} - ${pin}] ✓ ${result.status} | ${result.deliveryDate || 'N/A'}`);

        const resultObj = {
          productId,
          productTitle,
          pincode: pin,
          status: result.status,
          deliveryDate: result.deliveryDate,
          scrapedAt: timestamp,
        };
        results.push(resultObj);
        if (onResult) onResult(resultObj);

      } catch (error) {
        const errorMessage = error.message || 'Unknown scraping error';
        console.error(`[FAIL] ${productId} - ${pin}: ${errorMessage}`);
        registerFailure(productId, pin);

        const failObj = {
          productId,
          productTitle,
          pincode: pin,
          status: "Couldn't verify",
          deliveryDate: null,
          scrapedAt: timestamp,
          error: errorMessage,
        };
        results.push(failObj);
        if (onResult) onResult(failObj);

      } finally {
        if (ctx) await ctx.close().catch(() => {});
      }
    });
  });

  await Promise.allSettled(tasks);
  await browser.close();
  console.log(`[PARALLEL] Session closed for ${productId}. ${results.length}/${pincodes.length} results.`);

  return results;
}

/**
 * Block unnecessary resources to speed up page loads and reduce RAM.
 */
async function blockResources(page) {
  const BLOCKED_TYPES = new Set([
    'image', 'media', 'font',
    'imageset', 'texttrack', 'manifest',
  ]);

  const BLOCKED_DOMAINS = [
    'doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
    'googletagmanager.com', 'facebook.net', 'amazon-adsystem.com',
    'adsystem.amazon', 'fls-na.amazon', 'unagi.amazon', 'mads.amazon',
    'scorecardresearch.com', 'pixel.quantserve.com', 'cdn.cookielaw.org',
  ];

  await page.route('**/*', (route) => {
    const req = route.request();
    const type = req.resourceType();
    const reqUrl = req.url();

    if (BLOCKED_TYPES.has(type)) {
      return route.abort();
    }

    if (BLOCKED_DOMAINS.some(d => reqUrl.includes(d))) {
      return route.abort();
    }

    // Strip upgrade header to bypass CORS block on CDN scripts
    const headers = { ...req.headers() };
    if (headers['upgrade-insecure-requests']) {
      delete headers['upgrade-insecure-requests'];
    }

    return route.continue({ headers });
  });
}

/**
 * Dismiss login/cookie modals on first load.
 */
async function dismissInitialModals(page, platform) {
  try {
    if (platform === PLATFORMS.AMAZON) {
      const dismissBtn = page.locator('#nav-main a.nav-a, #dismiss-button, [data-action="a-popover-close"]').first();
      if (await dismissBtn.isVisible({ timeout: 1000 })) {
        await dismissBtn.click({ force: true });
        await sleep(150, 300);
      }
    } else if (platform === PLATFORMS.FLIPKART) {
      const closeBtn = page.locator('button._2KpZ6l._2doB4z, span._30XB9F').first();
      if (await closeBtn.isVisible({ timeout: 1000 })) {
        await closeBtn.click();
        await sleep(150, 300);
      }
    }
  } catch (_) { /* ignore */ }
}

/**
 * Amazon: Change PIN code and read availability.
 * Dynamic wait optimization to skip re-navigation if AJAX loads updates correctly.
 */
async function checkAmazonPin(page, pin, productId, url) {
  // Early CAPTCHA block check to fail fast instead of waiting 8s for popover selector
  const pageTitle = await page.title().catch(() => '');
  const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 300).toLowerCase()).catch(() => '');
  if (pageTitle.toLowerCase().includes('robot') || pageTitle.toLowerCase().includes('captcha') || bodySnippet.includes('robot') || bodySnippet.includes('captcha')) {
    throw new Error("Amazon blocked the scraper (Robot / CAPTCHA page detected). Please try again later.");
  }

  const pincodeInput = page.locator('input#GLUXZipUpdateInput').first();
  
  // Guard click: only click the widget if the input is not already visible (to prevent closing it)
  try {
    if (!(await pincodeInput.isVisible({ timeout: 200 }))) {
      const widget = page.locator('#nav-global-location-slot, #glow-ingress-block').first();
      if (await widget.isVisible({ timeout: 2000 })) {
        await widget.click({ force: true });
        // Wait up to 3s for the popover to animate and become visible
        await pincodeInput.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
      }
    }
  } catch (_) { /* ignore */ }

  // Fallback click: if it's still not visible after the first click and wait, try clicking the widget again
  try {
    if (!(await pincodeInput.isVisible({ timeout: 200 }))) {
      const widget = page.locator('#nav-global-location-slot, #glow-ingress-block').first();
      await widget.click({ force: true });
      // Wait up to 3s for fallback click visibility
      await pincodeInput.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    }
  } catch (_) { /* ignore */ }

  try {
    // Explicit 8s timeout with fallback handling
    await pincodeInput.waitFor({ state: 'visible', timeout: 8000 });
  } catch (e) {
    throw new Error(`PIN input not visible after clicking location widget: ${e.message}`);
  }

  await pincodeInput.click({ clickCount: 3 });
  await pincodeInput.fill(pin);
  await sleep(80, 150);

  const submitBtn = page.locator('#GLUXZipUpdate input[type="submit"], input.a-button-input[aria-labelledby="GLUXZipUpdate-announce"]').first();
  try {
    await submitBtn.waitFor({ state: 'visible', timeout: 2000 });
    await submitBtn.click({ force: true });
  } catch (_) {
    await pincodeInput.press('Enter');
  }

  // --- Dynamic Wait Optimization ---
  // Attempt to wait for the popup to close and nav header location text to update to the new PIN.
  // If it updates successfully, we skip the slow full page re-navigation.
  try {
    await pincodeInput.waitFor({ state: 'hidden', timeout: 5000 });
    
    // Check if header updates to contain the newly set pincode
    await page.waitForFunction((p) => {
      const el = document.querySelector('#glow-ingress-line2');
      return el && el.innerText.includes(p);
    }, pin, { timeout: 6000 });
    
    console.log(`[Amazon - ${pin}] Dynamic DOM update detected successfully. Skipping re-navigation!`);
  } catch (e) {
    console.warn(`[Amazon - ${pin}] Header did not update in 6s: ${e.message}. Falling back to full page re-navigation.`);
    await page.goto(url, { waitUntil: 'load', timeout: 25000 }).catch(() => {});
    await sleep(600, 1200);
  }

  // Wait for availability section or buybox container to attach
  try {
    await page.waitForSelector('#availability, #ddmDeliveryMessage, #deliveryBlockMessage, #mir-layout-DELIVERY_BLOCK, #outOfStock, #buybox', {
      state: 'attached',
      timeout: 8000, // Explicit 8s timeout for DOM stability
    });
  } catch (_) { /* ignore */ }

  return await parseAmazonAvailability(page);
}

/**
 * Parse Amazon availability from the current page state.
 */
async function parseAmazonAvailability(page) {
  let status = 'Unavailable';
  let deliveryDate = null;

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

  if (allText.trim().length === 0) {
    const pageTitle = await page.title().catch(() => 'Unknown Title');
    const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 300).replace(/\s+/g, ' ')).catch(() => '');
    console.warn(`[Amazon Debug] Empty snippet. Title: "${pageTitle}". Body snippet: "${bodySnippet}"`);
    
    if (pageTitle.toLowerCase().includes('robot') || bodySnippet.toLowerCase().includes('robot') || bodySnippet.toLowerCase().includes('captcha')) {
      throw new ScraperError("Amazon blocked the scraper (Robot / CAPTCHA page detected). Please try again later.", 'BLOCKED');
    }
    const lowerTitle = pageTitle.toLowerCase().trim();
    if (lowerTitle === 'page not found' || lowerTitle === 'amazon.in - page not found' || lowerTitle === '404 - document not found' || lowerTitle === 'amazon.com - page not found') {
      throw new ScraperError("Product page not found (404). Please verify the product URL.", 'NOT_FOUND');
    }
  }

  console.log(`[Amazon] Availability text snippet: "${allText.substring(0, 200)}"`);

  const outOfStockPhrases = [
    'currently unavailable', 'out of stock', 'we don\'t know when or if',
    'cannot be delivered to this location', 'not deliverable', 'does not deliver to',
    'unavailable', 'we don\'t ship this item', 'does not ship to', 'unable to deliver',
    'delivery is not available', 'cannot be shipped', 'choose a different delivery location',
  ];

  const availablePhrases = [
    'in stock', 'only', 'left in stock', 'delivery', 'get it by',
    'get it as soon as', 'ships from', 'sold by', 'add to cart',
  ];

  const isOut = outOfStockPhrases.some(k => allText.includes(k));
  const isAvailable = availablePhrases.some(k => allText.includes(k));

  if (isOut) {
    status = 'Unavailable';
  } else if (isAvailable || (!isOut && allText.length > 20)) {
    status = 'Available';
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
    throw new ScraperError('Could not determine availability: page content insufficient', 'CONTENT_INSUFFICIENT');
  }

  return { status, deliveryDate };
}

/**
 * Flipkart: Change PIN code and read availability.
 */
async function checkFlipkartPin(page, pin, productId) {
  // Ensure we are scrolled to bring delivery section in view and hydrate it
  await page.evaluate(() => window.scrollBy(0, 700));
  await sleep(1500, 2000);

  let input = page.locator('input#pincodeInputId, input[placeholder*="Search by area"], input[placeholder*="pin code"]').first();
  const isInputVisible = await input.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isInputVisible) {
    console.log(`[Flipkart - ${pin}] Pincode input is not visible. Searching for openers...`);
    
    // Construct robust opener using Playwright's locator.or() builder
    let opener = page.locator('a:has-text("Select delivery location")');
    opener = opener.or(page.locator('a:has-text("Location not set")'));
    opener = opener.or(page.locator('a:has-text("Deliver to")'));
    opener = opener.or(page.locator('div._3X230a'));
    opener = opener.or(page.locator('div.ld-VE3'));
    opener = opener.or(page.locator('div._2afOB6'));
    opener = opener.or(page.locator('[class*="pincode"]'));
    opener = opener.or(page.locator('text=/Select delivery location/i'));
    opener = opener.or(page.locator('text=/Location not set/i'));
    opener = opener.or(page.locator('text=/Deliver to/i'));

    try {
      const firstOpener = opener.first();
      await firstOpener.waitFor({ state: 'visible', timeout: 5000 });
      console.log(`[Flipkart - ${pin}] Opener found! Text: "${await firstOpener.innerText()}"`);
      await firstOpener.click({ force: true });
      await sleep(1500, 2000);
    } catch (e) {
      console.warn(`[Flipkart - ${pin}] Failed to find/click location opener: ${e.message}`);
    }
  }

  input = page.locator('input#pincodeInputId, input[placeholder*="Search by area"], input[placeholder*="pin code"]').first();
  try {
    await input.waitFor({ state: 'visible', timeout: 5000 });
  } catch (err) {
    throw new ScraperError(`PIN input not visible after clicking location widget: ${err.message}`, 'PIN_INPUT_TIMEOUT');
  }
  await input.click({ clickCount: 3 });
  await input.fill(pin);
  await sleep(2500); // let suggestions load

  const suggestion = page.locator(`text=${pin}`).first();
  const isSuggestionVisible = await suggestion.isVisible().catch(() => false);

  if (isSuggestionVisible) {
    console.log(`[Flipkart - ${pin}] Suggestion containing pin visible. Clicking suggestion...`);
    await suggestion.click();
    await sleep(2000); // wait for map popup

    const confirmBtn = page.locator('text="Confirm"').first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      console.log(`[Flipkart - ${pin}] Clicking map Confirm button...`);
      await confirmBtn.click();
      await sleep(4000); // wait for map to close and page to update
    } else {
      console.warn(`[Flipkart - ${pin}] Confirm button not found on map popup.`);
    }
  } else {
    console.log(`[Flipkart - ${pin}] Suggestion not visible. Pressing Enter to verify...`);
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
    await sleep(3500);
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
    // 1. Search for elements containing the text "delivery details"
    const headers = Array.from(document.querySelectorAll('*')).filter(el => 
      el.innerText && el.innerText.trim().toLowerCase() === 'delivery details'
    );
    
    if (headers.length > 0) {
      // Find the closest wrapper container
      let parent = headers[0].parentElement;
      // We traverse up to 3 levels to capture the whole delivery details block (e.g. delivery date, pincode text, fulfillment)
      for (let i = 0; i < 3; i++) {
        if (parent && parent.tagName !== 'BODY') {
          parent = parent.parentElement;
        }
      }
      if (parent) return parent.innerText || '';
    }
    
    // Fallback selectors
    const selectors = [
      'div._3X230a', 'div._1TP2go', 'div.NY1eFD', 'div._2NjOI7',
      'div._3XINqE', 'div[class*="delivery"]', 'div[class*="Delivery"]',
    ];
    return selectors
      .flatMap(sel => Array.from(document.querySelectorAll(sel)))
      .map(el => el.innerText || el.textContent || '')
      .join(' ');
  });

  const allTextLower = allText.toLowerCase();
  console.log(`[Flipkart] Scraped delivery text snippet: "${allText.replace(/\s+/g, ' ').substring(0, 200)}"`);

  const outPhrases = ['not deliverable', 'out of stock', 'currently unavailable', 'not available', 'no seller delivering'];
  const inPhrases = ['delivery by', 'delivered by', 'standard delivery', 'tomorrow', 'today', 'days', 'free delivery'];

  const isOut = outPhrases.some(k => allTextLower.includes(k));
  const isIn = inPhrases.some(k => allTextLower.includes(k));

  if (isOut) {
    status = 'Unavailable';
  } else if (isIn || allText.length > 10) {
    status = 'Available';
    try {
      deliveryDate = await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('*')).filter(el => 
          el.innerText && el.innerText.trim().toLowerCase() === 'delivery details'
        );
        if (headers.length > 0) {
          let parent = headers[0].parentElement;
          for (let i = 0; i < 3; i++) {
            if (parent && parent.tagName !== 'BODY') parent = parent.parentElement;
          }
          if (parent) {
            // Find lines containing "Delivery by", "Delivered by", "tomorrow", or "today"
            const lines = parent.innerText.split('\n').map(l => l.trim());
            const dateLine = lines.find(l => /(?:delivery|delivered)\s+by|tomorrow|today/i.test(l));
            if (dateLine) return dateLine;
          }
        }
        
        const el = document.querySelector('div._3X230a, div.NY1eFD, div._1TP2go');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
      });
    } catch (_) {
      deliveryDate = 'Standard Delivery';
    }
  } else {
    throw new ScraperError('Could not determine availability: page content insufficient', 'CONTENT_INSUFFICIENT');
  }

  return { status, deliveryDate };
}
