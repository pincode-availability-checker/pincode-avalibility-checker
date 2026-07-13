import { chromium } from 'playwright';
import { getRandomUserAgent, applyStealth } from './scraper/mitigations.js';

async function takeScreenshots() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  await applyStealth(page);

  // Artifact directory
  const artifactDir = 'C:/Users/HP/.gemini/antigravity/brain/2b856c82-cb55-4281-be48-6d64f7de77c5';

  try {
    console.log('Navigating to Amazon (SanDisk Cruzer)...');
    await page.goto('https://www.amazon.in/dp/B005FYNT3G', { waitUntil: 'load', timeout: 30000 });
    
    console.log('Clicking location widget...');
    const widget = page.locator('#nav-global-location-slot, #glow-ingress-block, a#nav-global-location-popover-link').first();
    await widget.click({ force: true });
    
    console.log('Waiting for popover...');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: `${artifactDir}/amazon_popover_debug.png` });
    console.log('Amazon popover screenshot saved.');
  } catch (err) {
    console.error('Amazon popover click/screenshot failed:', err.message);
  }

  await browser.close();
  console.log('Done screenshots.');
}

takeScreenshots();
