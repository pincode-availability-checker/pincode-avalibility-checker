import { parseProductUrl } from '../scraper/parsers.js';
import { getCache } from '../config/redis.js';
import { dispatchScraperJob } from '../queue/queue.js';
import { Product } from '../models/Product.js';
import { getScraperMetrics } from '../monitoring/alerts.js';

/**
 * Controller to handle Regional Product Availability checks.
 */
export async function checkAvailability(req, res) {
  try {
    const { url, pins } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Missing required query parameter: url' });
    }

    if (!pins) {
      return res.status(400).json({ error: 'Missing required query parameter: pins' });
    }

    // Split and sanitize PIN codes (must be 6-digit numbers in India)
    const rawPins = pins.split(',').map(pin => pin.trim());
    const pincodes = rawPins.filter(pin => /^\d{6}$/.test(pin));

    if (pincodes.length === 0) {
      return res.status(400).json({ error: 'Invalid PIN codes. Please provide 6-digit numeric values.' });
    }

    // Restrict exhaustive location checking (e.g. max 15 PINs per run)
    if (pincodes.length > 15) {
      return res.status(400).json({ error: 'Query limit exceeded. You can check a maximum of 15 PIN codes per request.' });
    }

    // Parse URL to identify Product ID and Platform
    let parsedUrlInfo;
    try {
      parsedUrlInfo = parseProductUrl(url);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const { productId, platform } = parsedUrlInfo;
    
    // Check MongoDB for product title first (in case it exists)
    let productTitle = 'Product';
    try {
      const existingProduct = await Product.findOne({ productId });
      if (existingProduct) {
        productTitle = existingProduct.title;
      }
    } catch (e) {
      console.warn(`Error reading product from MongoDB: ${e.message}`);
    }

    const cacheHits = [];
    const cacheMisses = [];

    // Query Redis cache for each pincode
    for (const pin of pincodes) {
      const cacheKey = `availability:${productId}:${pin}`;
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        cacheHits.push({
          ...cachedData,
          source: 'cache',
        });
      } else {
        cacheMisses.push(pin);
      }
    }

    let freshScrapedResults = [];
    let scrapeError = null;

    // Trigger Playwright scraper for cache misses
    if (cacheMisses.length > 0) {
      try {
        console.log(`Cache miss for PINs: ${cacheMisses.join(', ')}. Dispatching scraper...`);
        freshScrapedResults = await dispatchScraperJob(url, platform, productId, cacheMisses);
      } catch (err) {
        console.error(`Scraper execution failed: ${err.message}`);
        scrapeError = err.message;

        // Populate failures into results list so we don't abort entire request
        freshScrapedResults = cacheMisses.map(pin => ({
          productId,
          productTitle,
          pincode: pin,
          status: "Couldn't verify",
          deliveryDate: null,
          scrapedAt: new Date(),
          source: 'live',
          error: err.message,
        }));
      }
    }

    // Map source and cleanup fresh results
    const normalizedFreshResults = freshScrapedResults.map(item => ({
      productId: item.productId,
      productTitle: item.productTitle,
      pincode: item.pincode,
      status: item.status,
      deliveryDate: item.deliveryDate,
      scrapedAt: item.scrapedAt.toISOString ? item.scrapedAt.toISOString() : new Date(item.scrapedAt).toISOString(),
      source: 'live',
      ...(item.error && { error: item.error }),
    }));

    // If we got a product title from fresh scrapes, update it
    if (normalizedFreshResults.length > 0 && normalizedFreshResults[0].productTitle !== 'Unknown Product') {
      productTitle = normalizedFreshResults[0].productTitle;
    }

    // Combine cache hits and fresh scraper results
    const combinedResults = [...cacheHits, ...normalizedFreshResults];

    // Sort results to match original input PIN order
    combinedResults.sort((a, b) => pincodes.indexOf(a.pincode) - pincodes.indexOf(b.pincode));

    // Calculate metadata summary count
    const totalCount = combinedResults.length;
    const failedCount = combinedResults.filter(r => r.status === "Couldn't verify").length;
    const availableCount = combinedResults.filter(r => r.status === 'Available').length;
    const unavailableCount = combinedResults.filter(r => r.status === 'Unavailable').length;

    return res.status(200).json({
      productId,
      platform,
      productTitle,
      url,
      summary: {
        totalChecked: totalCount,
        available: availableCount,
        unavailable: unavailableCount,
        failed: failedCount,
      },
      results: combinedResults,
      ...(scrapeError && { errorWarning: `Partial scraping failure: ${scrapeError}` }),
    });

  } catch (globalError) {
    console.error(`Availability controller critical error: ${globalError.stack}`);
    // Strip stack trace in production as required by security anti-patterns
    const responseError = process.env.NODE_ENV === 'production' 
      ? 'An internal server error occurred while processing availability.' 
      : globalError.message;
      
    return res.status(500).json({ error: responseError });
  }
}

/**
 * Controller to fetch failure metrics.
 */
export function checkMetrics(req, res) {
  try {
    const metrics = getScraperMetrics();
    return res.status(200).json(metrics);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
