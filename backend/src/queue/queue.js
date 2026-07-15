import { Queue, QueueEvents } from 'bullmq';
import { redisClient, redisConnected } from '../config/redis.js';
import { scrapeProductAvailability } from '../scraper/engine.js';

const QUEUE_NAME = 'ScraperQueue';

let scraperQueue = null;
let scraperQueueEvents = null;

if (redisClient && redisClient.options) {
  // Initialize BullMQ Queue
  scraperQueue = new Queue(QUEUE_NAME, {
    connection: redisClient,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: 500, // keep fail logs for debugging
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 2000,
      }
    }
  });

  scraperQueue.on('error', (err) => {
    // Suppress console spam if Redis is offline
    if (redisConnected) {
      console.error(`BullMQ Queue Error: ${err.message}`);
    }
  });

  // Initialize QueueEvents to listen to job updates
  scraperQueueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisClient
  });

  scraperQueueEvents.on('error', (err) => {
    // Suppress console spam if Redis is offline
    if (redisConnected) {
      console.error(`BullMQ QueueEvents Error: ${err.message}`);
    }
  });
}

/**
 * Dispatches a scraping job for a product and list of PINs.
 * If Redis is disconnected, it falls back to executing the scraper directly.
 * Handles deduplication by using deterministic jobIds.
 * 
 * @param {string} url - Product URL
 * @param {string} platform - 'amazon' | 'flipkart'
 * @param {string} productId - Product ID
 * @param {string[]} pincodes - Array of PIN codes
 * @returns {Promise<Object[]>} Availability results
 */
export async function dispatchScraperJob(url, platform, productId, pincodes) {
  if (!redisConnected || !scraperQueue) {
    console.warn('Redis is offline. Falling back to direct scraping (no queue/dedup)...');
    return await scrapeProductAvailability(url, platform, productId, pincodes);
  }

  // Create a deterministic jobId by joining sorted PINs
  // E.g., `scrape:B0BY8JZ22K:110001,400001`
  const sortedPins = [...pincodes].sort().join(',');
  const jobId = `scrape:${productId}:${sortedPins}`;

  try {
    // Add job to BullMQ. If jobId already exists in queue, BullMQ deduplicates it
    const job = await scraperQueue.add(
      'scrape-pincodes',
      { url, platform, productId, pincodes },
      { jobId }
    );
    
    console.log(`Job enqueued or matched existing: ${job.id}`);
    
    // Await job completion and return its value
    return await awaitJobCompletion(job.id);
  } catch (error) {
    console.error(`Error in queue dispatch: ${error.message}. Executing scraper fallback...`);
    return await scrapeProductAvailability(url, platform, productId, pincodes);
  }
}

/**
 * Listens for job completion or failure events using QueueEvents.
 */
function awaitJobCompletion(jobId) {
  return new Promise((resolve, reject) => {
    if (!scraperQueueEvents) {
      reject(new Error('QueueEvents not initialized'));
      return;
    }

    const onCompleted = ({ jobId: completedId, returnvalue }) => {
      if (completedId === jobId) {
        cleanup();
        try {
          resolve(JSON.parse(returnvalue));
        } catch (e) {
          resolve(returnvalue);
        }
      }
    };

    const onFailed = ({ jobId: failedId, failedReason }) => {
      if (failedId === jobId) {
        cleanup();
        reject(new Error(failedReason || 'Job failed in worker execution'));
      }
    };

    const cleanup = () => {
      scraperQueueEvents.off('completed', onCompleted);
      scraperQueueEvents.off('failed', onFailed);
    };

    scraperQueueEvents.on('completed', onCompleted);
    scraperQueueEvents.on('failed', onFailed);

    // Timeout safety: if job takes too long (e.g. 5 minutes), reject it
    setTimeout(() => {
      cleanup();
      reject(new Error('Scraping job timed out in queue'));
    }, 300000);
  });
}
