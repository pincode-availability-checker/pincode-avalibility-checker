import { scrapeProductAvailability } from './scraper/engine.js';
import { parseProductUrl } from './scraper/parsers.js';

// Simple test script to verify scraping is working correctly
async function runTest() {
  // Test URLs
  const amazonUrl = 'https://www.amazon.in/dp/B005FYNT3G'; // SanDisk Cruzer Blade 32GB on Amazon.in
  const flipkartUrl = 'https://www.flipkart.com/realme-p1-5g-phoenix-red-128-gb/p/itmdb06883b27b82?pid=MOBGZGHEXYSHHH7P'; // A sample product on Flipkart

  const testPins = ['110001', '400001']; // Delhi & Mumbai

  console.log('--- TESTING AMAZON SCRAPING ---');
  try {
    const amzInfo = parseProductUrl(amazonUrl);
    const amzResults = await scrapeProductAvailability(amazonUrl, amzInfo.platform, amzInfo.productId, testPins);
    console.log('Amazon Results:', JSON.stringify(amzResults, null, 2));
  } catch (error) {
    console.error('Amazon scrape test failed:', error.message);
  }

  console.log('\n--- TESTING FLIPKART SCRAPING ---');
  try {
    const fkInfo = parseProductUrl(flipkartUrl);
    const fkResults = await scrapeProductAvailability(flipkartUrl, fkInfo.platform, fkInfo.productId, testPins);
    console.log('Flipkart Results:', JSON.stringify(fkResults, null, 2));
  } catch (error) {
    console.error('Flipkart scrape test failed:', error.message);
  }
}

runTest();
