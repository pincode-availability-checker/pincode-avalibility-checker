import { chromium } from 'playwright';
import { getRandomUserAgent, sleep, applyStealth } from './mitigations.js';
import { PLATFORMS, selectors } from './parsers.js';
import { registerFailure } from '../monitoring/alerts.js';

/**
 * Scrapes a list of PIN codes for a given product URL.
 * All PINs are checked sequentially inside a single browser context/page session.
 * 
 * @param {string} url - Product URL
 * @param {string} platform - 'amazon' | 'flipkart'
 * @param {string} productId - Unique ID of the product
 * @param {string[]} pincodes - Array of 6-digit PIN codes to check
 * @returns {Promise<Object[]>} Array of result objects
 */
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
    ],
  });

  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await applyStealth(page);

  const results = [];

  try {
    // Navigate to the product page initially
    console.log(`Navigating to target URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Accept cookie popups or dismiss initial prompts if they exist
    await dismissInitialModals(page, platform);

    // Get the product title if possible
    let productTitle = 'Unknown Product';
    try {
      if (platform === PLATFORMS.AMAZON) {
        productTitle = await page.locator('#title, #productTitle').first().textContent({ timeout: 3000 });
      } else if (platform === PLATFORMS.FLIPKART) {
        productTitle = await page.locator('span.B_NuCI, h1.yjC53s, span.VU-ZEz').first().textContent({ timeout: 3000 });
      }
      productTitle = productTitle.trim();
    } catch (e) {
      console.warn(`Could not extract product title: ${e.message}`);
    }

    const platformSelectors = selectors[platform];

    for (const pin of pincodes) {
      const timestamp = new Date();
      console.log(`[${productId} - ${pin}] Checking availability...`);

      try {
        if (platform === PLATFORMS.AMAZON) {
          await checkAmazonPincode(page, pin, platformSelectors);
        } else if (platform === PLATFORMS.FLIPKART) {
          await checkFlipkartPincode(page, pin, platformSelectors);
        } else {
          throw new Error(`Unsupported platform: ${platform}`);
        }

        // Parse result from the page
        const result = await parseAvailability(page, platform, platformSelectors);
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
        // Granular Try/Catch: Log failure for this specific PIN and proceed to the next one
        const errorMessage = error.message || 'Unknown scraping error';
        console.error(`[SCRAPE FAILURE] Product: ${productId}, PIN: ${pin}, Timestamp: ${timestamp.toISOString()}, Error: ${errorMessage}`);
        
        // Register failure for observability metric
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

        // If we hit a total navigation/session crash, reload the page to refresh session state
        try {
          if (errorMessage.includes('navigation') || errorMessage.includes('Target closed') || errorMessage.includes('context')) {
            console.log('Session issue detected. Re-navigating to restore scraper state...');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          }
        } catch (reloadErr) {
          console.error(`Failed to reload page after error: ${reloadErr.message}`);
        }
      }
    }

  } catch (globalError) {
    console.error(`CRITICAL: Global scraper session error for ${productId}: ${globalError.message}`);
    // If the browser session completely failed before we could do individual loops
    for (const pin of pincodes) {
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
  } finally {
    await browser.close();
    console.log(`Scraper session closed for product ${productId}.`);
  }

  return results;
}

/**
 * Handle initial popups/modals to avoid intercepting clicks.
 */
async function dismissInitialModals(page, platform) {
  try {
    if (platform === PLATFORMS.AMAZON) {
      // Dismiss Amazon "Select delivery address" popup if it block clicks
      const dismissBtn = page.locator('#nav-main a.nav-a, #dismiss-button, .a-popover-header button[data-action="a-popover-close"]');
      if (await dismissBtn.first().isVisible({ timeout: 2000 })) {
        await dismissBtn.first().click();
        await sleep(200, 500);
      }
    } else if (platform === PLATFORMS.FLIPKART) {
      // Dismiss Flipkart login popup
      const closeBtn = page.locator('span._30XB9F, button._2KpZ6l._2doB4z');
      if (await closeBtn.first().isVisible({ timeout: 2000 })) {
        await closeBtn.first().click();
        await sleep(200, 500);
      }
    }
  } catch (e) {
    // Ignore modal dismissal errors
  }
}

/**
 * Amazon Pincode Change Interaction
 */
async function checkAmazonPincode(page, pin, sel) {
  // Click on the location delivery widget
  const widget = page.locator(sel.locationWidget).first();
  await widget.scrollIntoViewIfNeeded({ timeout: 4000 });
  await widget.click({ force: true, timeout: 2000 });

  // Wait for popover and input to be visible
  const input = page.locator(sel.pincodeInput);
  await input.waitFor({ state: 'visible', timeout: 5000 });
  await input.focus({ timeout: 2000 });
  await input.fill('');
  await sleep(100, 300);
  await input.type(pin, { delay: 100 }); // Emulate human typing speed
  
  await sleep(300, 800);

  // Click Submit
  const submit = page.locator(sel.pincodeSubmit).first();
  await submit.click({ timeout: 2000 });

  // Handle Amazon popover closing and/or page updating
  try {
    // Wait for the done/confirm button to appear and click it
    const doneBtn = page.locator(sel.doneButton).first();
    if (await doneBtn.isVisible({ timeout: 2000 })) {
      await doneBtn.click();
    }
  } catch (e) {
    // Done button not present
  }

  // Wait for the location widget to reflect the new PIN
  await page.waitForFunction(
    (pinCode) => {
      const el = document.querySelector('#glow-ingress-line2') || 
                 document.querySelector('#nav-global-location-slot') ||
                 document.body;
      return el && el.textContent.includes(pinCode);
    },
    pin,
    { timeout: 6000 }
  );

  // Wait for the availability info container to load
  await page.waitForSelector(sel.availabilityContainer, { state: 'visible', timeout: 5000 });
}

/**
 * Flipkart Pincode Change Interaction
 */
async function checkFlipkartPincode(page, pin, sel) {
  const input = page.locator(sel.pincodeInput).first();
  
  // If pincode input is not immediately visible, it means location is not set and we have a selector dialog trigger
  if (!(await input.isVisible())) {
    const opener = page.locator('text="Select delivery location", text="Enter pincode", text="Deliver to", ._2PciBh').first();
    if (await opener.isVisible({ timeout: 2000 })) {
      await opener.click();
      await sleep(500, 1000);
    }
  }

  await input.scrollIntoViewIfNeeded({ timeout: 4000 });
  
  // Flipkart input could be inside a field. Focus, select all, and type.
  await input.click({ timeout: 2000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(100, 300);
  await input.type(pin, { delay: 100 });

  await sleep(300, 800);

  // Click check button
  const submit = page.locator(sel.pincodeSubmit).first();
  await submit.click({ timeout: 2000 });

  // Wait for the delivery section to update.
  await page.waitForSelector(sel.deliveryContainer, { state: 'visible', timeout: 5000 });

  // Brief sleep to let any animation/local state updates finish
  await sleep(300, 600);
}

/**
 * Parses the page content to determine availability and extract delivery dates.
 */
async function parseAvailability(page, platform, sel) {
  let status = 'Unavailable';
  let deliveryDate = null;

  if (platform === PLATFORMS.AMAZON) {
    const availText = await page.locator(sel.availabilityContainer).allTextContents();
    const combinedText = availText.join(' ').toLowerCase();

    const isOut = sel.outOfStockKeywords.some(keyword => combinedText.includes(keyword));
    
    if (isOut) {
      status = 'Unavailable';
    } else {
      status = 'Available';
      // Attempt to extract delivery date details
      try {
        const dateText = await page.locator(sel.deliveryDateContainer).first().textContent();
        if (dateText) {
          // Clean up the string (remove extra spaces/newlines)
          deliveryDate = dateText.replace(/\s+/g, ' ').trim();
        }
      } catch (e) {
        // Fallback if delivery date selector fails
        deliveryDate = 'Standard Delivery';
      }
    }
  } else if (platform === PLATFORMS.FLIPKART) {
    const deliveryText = await page.locator(sel.deliveryContainer).allTextContents();
    const combinedText = deliveryText.join(' ').toLowerCase();

    const isOut = sel.outOfStockKeywords.some(keyword => combinedText.includes(keyword));

    if (isOut) {
      status = 'Unavailable';
    } else {
      status = 'Available';
      try {
        // Search text inside delivery containers for date matches (e.g. "Delivery by", "tomorrow", etc.)
        for (const text of deliveryText) {
          const cleanedText = text.trim();
          if (cleanedText && (cleanedText.toLowerCase().includes('delivery') || cleanedText.toLowerCase().includes('tomorrow') || cleanedText.toLowerCase().includes('day'))) {
            deliveryDate = cleanedText.replace(/\s+/g, ' ');
            break;
          }
        }
        if (!deliveryDate && deliveryText.length > 0) {
          deliveryDate = deliveryText[0].trim().replace(/\s+/g, ' ');
        }
      } catch (e) {
        deliveryDate = 'Standard Delivery';
      }
    }
  }

  return { status, deliveryDate };
}
