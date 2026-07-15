import { chromium } from 'playwright';
import { getRandomUserAgent, applyStealth } from './scraper/mitigations.js';
import { fileURLToPath } from 'url';

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

  // Cross-platform absolute path resolution from ES module URL
  const artifactDir = fileURLToPath(new URL('../debug-output', import.meta.url));
  const fs = await import('fs');
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

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
