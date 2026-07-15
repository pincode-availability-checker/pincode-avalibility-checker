import { Worker } from 'bullmq';
import { redisClient, redisConnected, setCache } from '../config/redis.js';
import { scrapeProductAvailability } from '../scraper/engine.js';
import { Product } from '../models/Product.js';
import { AvailabilityLog } from '../models/AvailabilityLog.js';
import { registerSuccess } from '../monitoring/alerts.js';
import mongoose from 'mongoose';

const QUEUE_NAME = 'ScraperQueue';
let worker = null;

if (redisClient && redisClient.options) {
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { url, platform, productId, pincodes } = job.data;
      console.log(`Worker processing job ${job.id} for product ${productId}...`);

      try {
        // Run scraper engine
        const results = await scrapeProductAvailability(url, platform, productId, pincodes);

        // Process and save results
        await persistResults(url, platform, productId, results);

        // Return results as JSON string
        return JSON.stringify(results);
      } catch (error) {
        console.error(`Worker error processing job ${job.id}: ${error.message}`);
        throw error;
      }
    },
    {
      connection: redisClient,
      concurrency: 2, // Limit concurrent browser instances to avoid CPU bottlenecks
      lockDuration: 180000, // 3 minutes lock to prevent stalling on long scraping runs
    }
  );

  worker.on('active', (job) => {
    console.log(`Job ${job.id} has started processing`);
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    // Suppress console spam if Redis is offline
    if (redisConnected) {
      console.error(`BullMQ Worker Error: ${err.message}`);
    }
  });
}

/**
 * Saves results to MongoDB (Product and AvailabilityLog) and caches them in Redis.
 * Degrades gracefully if database or Redis connection fails.
 */
export async function persistResults(url, platform, productId, results) {
  if (!results || results.length === 0) return;

  const productTitle = results[0].productTitle || 'Unknown Product';

  // 1. Save or update product info in MongoDB (only if connected)
  if (mongoose.connection.readyState === 1) {
    try {
      await Product.findOneAndUpdate(
        { productId },
        {
          productId,
          title: productTitle,
          url,
          platform,
        },
        { upsert: true, new: true }
      );
    } catch (dbError) {
      console.error(`Failed to save product ${productId} metadata to MongoDB: ${dbError.message}`);
    }
  } else {
    console.warn(`MongoDB not connected. Skipping product metadata save for ${productId}`);
  }

  // 2. Iterate through results, save logs to Mongo, and cache in Redis
  for (const item of results) {
    const cacheKey = `availability:${productId}:${item.pincode}`;

    // Register success/failure with alert monitoring
    if (item.status !== "Couldn't verify") {
      registerSuccess(productId, item.pincode);
    }

    // Caching disabled: do not write to Redis cache

    // Save history log to MongoDB (only if connected)
    if (mongoose.connection.readyState === 1) {
      try {
        const log = new AvailabilityLog({
          productId: item.productId,
          pincode: item.pincode,
          status: item.status,
          deliveryDate: item.deliveryDate,
          scrapedAt: item.scrapedAt,
        });
        await log.save();
      } catch (dbError) {
        console.error(`Failed to save availability log for product ${productId} pin ${item.pincode} to MongoDB: ${dbError.message}`);
      }
    }
  }
}

export { worker };
