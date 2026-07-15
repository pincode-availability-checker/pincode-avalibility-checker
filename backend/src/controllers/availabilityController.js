import { parseProductUrl } from '../scraper/parsers.js';
import { getCache, setCache } from '../config/redis.js';
import { dispatchScraperJob } from '../queue/queue.js';
import { scrapeProductAvailability } from '../scraper/engine.js';
import { Product } from '../models/Product.js';
import { getScraperMetrics } from '../monitoring/alerts.js';
import mongoose from 'mongoose';


import { chromium } from 'playwright';

/**
 * Helper to resolve redirects for short links (e.g. amzn.in, amzn.to)
 * Uses Playwright to follow JS-based redirects that fetch() can't handle.
 */
async function resolveUrl(urlStr) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(urlStr, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const finalUrl = page.url();
    await browser.close();
    return finalUrl;
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return urlStr;
  }
}

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

    // Resolve short links / redirects (e.g. amzn.in/d/...)
    let resolvedUrl = url;
    if (url.includes('amzn.in') || url.includes('amzn.to') || url.includes('flipkart.com/dl') || url.includes('t.co') || url.includes('amzn.')) {
      try {
        resolvedUrl = await resolveUrl(url);
        console.log(`Resolved short URL: ${url} -> ${resolvedUrl}`);
      } catch (e) {
        console.warn(`Failed to resolve redirect: ${e.message}`);
      }
    }

    // Parse URL to identify Product ID and Platform
    let parsedUrlInfo;
    try {
      parsedUrlInfo = parseProductUrl(resolvedUrl);
    } catch (e) {
      return res.status(400).json({ error: e.code || 'UNSUPPORTED_PLATFORM', message: e.message });
    }

    const { productId, platform } = parsedUrlInfo;
    
    // Check MongoDB for product title first (only if connected)
    let productTitle = 'Product';
    if (mongoose.connection.readyState === 1) {
      try {
        const existingProduct = await Product.findOne({ productId });
        if (existingProduct) {
          productTitle = existingProduct.title;
        }
      } catch (e) {
        console.warn(`Error reading product from MongoDB: ${e.message}`);
      }
    } else {
      console.warn(`MongoDB not connected. Skipping product title lookup for ${productId}`);
    }

    // Query Redis cache for each pincode (Disabled: always live)
    const cacheHits = [];
    const cacheMisses = [...pincodes];

    let freshScrapedResults = [];
    let scrapeError = null;

    // Trigger Playwright scraper for cache misses
    if (cacheMisses.length > 0) {
      try {
        console.log(`Cache miss for PINs: ${cacheMisses.join(', ')}. Dispatching scraper...`);
        freshScrapedResults = await dispatchScraperJob(resolvedUrl, platform, productId, cacheMisses);
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
      url: resolvedUrl,
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
 * SSE streaming controller — sends each PIN result as it's scraped.
 * Frontend connects via EventSource and receives cards one by one.
 */
export async function streamAvailability(req, res) {
  const { url, pins } = req.query;

  // --- Validate inputs ---
  if (!url) return res.status(400).json({ error: 'Missing required query parameter: url' });
  if (!pins) return res.status(400).json({ error: 'Missing required query parameter: pins' });

  const rawPins = pins.split(',').map(p => p.trim());
  const pincodes = rawPins.filter(p => /^\d{6}$/.test(p));

  if (pincodes.length === 0)
    return res.status(400).json({ error: 'Invalid PIN codes. Please provide 6-digit numeric values.' });

  if (pincodes.length > 15)
    return res.status(400).json({ error: 'Query limit exceeded. Maximum 15 PIN codes per request.' });

  // --- Set up SSE headers ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Helper to send an SSE event
  const sendEvent = (event, data) => {
    try {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    } catch (_) {}
  };

  const done = (extraData = {}) => {
    sendEvent('done', extraData);
    res.end();
  };

  try {
    // --- Resolve short URLs ---
    let resolvedUrl = url;
    if (url.includes('amzn.in') || url.includes('amzn.to') || url.includes('flipkart.com/dl') || url.includes('amzn.')) {
      try {
        resolvedUrl = await resolveUrl(url);
        console.log(`[SSE] Resolved short URL: ${url} -> ${resolvedUrl}`);
      } catch (e) {
        console.warn(`[SSE] Failed to resolve redirect: ${e.message}`);
      }
    }

    // --- Parse product ID + platform ---
    let parsedUrlInfo;
    try {
      parsedUrlInfo = parseProductUrl(resolvedUrl);
    } catch (e) {
      sendEvent('error', { error: e.code || 'UNSUPPORTED_PLATFORM', message: e.message });
      return res.end();
    }

    const { productId, platform } = parsedUrlInfo;

    // Send meta event so the frontend can show the product header immediately
    sendEvent('meta', { productId, platform, resolvedUrl });

    // --- Check Redis cache (Disabled: always live) ---
    const cacheMisses = [...pincodes];

    // --- Run scraper directly for cache misses, streaming results as they arrive ---
    console.log(`[SSE] Cache miss for PINs: ${cacheMisses.join(', ')}. Starting direct scrape...`);

    await scrapeProductAvailability(
      resolvedUrl,
      platform,
      productId,
      cacheMisses,
      async (result) => {
        // Normalize dates
        const normalized = {
          ...result,
          scrapedAt: result.scrapedAt instanceof Date
            ? result.scrapedAt.toISOString()
            : new Date(result.scrapedAt).toISOString(),
          source: 'live',
        };

        // Stream this result to the frontend immediately
        sendEvent('result', normalized);

        // Caching disabled: do not write to Redis cache
      }
    );

    done({ productId, platform });

  } catch (globalError) {
    console.error(`[SSE] Critical error: ${globalError.message}`);
    sendEvent('error', { error: 'Internal server error during streaming.' });
    res.end();
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
