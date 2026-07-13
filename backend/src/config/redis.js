import Redis from 'ioredis';
import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const REDIS_URL = process.env.REDIS_URL;

let redisClient = null;
let redisConnected = false;

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // Critical for BullMQ
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      console.log('Redis connecting...');
    });

    redisClient.on('ready', () => {
      redisConnected = true;
      console.log('Redis connection established and ready');
    });

    redisClient.on('error', (err) => {
      redisConnected = false;
      console.error(`Redis Error: ${err.message}`);
    });

    redisClient.on('close', () => {
      redisConnected = false;
      console.warn('Redis connection closed');
    });
  } catch (error) {
    console.error(`Failed to initialize Redis client: ${error.message}`);
  }
} else {
  console.warn('WARNING: REDIS_URL is not defined in the environment variables. Redis caching will be disabled.');
}

// Helpers for caching to ensure graceful degradation if Redis is down
export async function getCache(key) {
  if (!redisClient || !redisConnected) {
    return null;
  }
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Error reading from Redis cache for key ${key}: ${error.message}`);
    return null;
  }
}

export async function setCache(key, value, ttlSeconds = 21600) { // Default 6 hours (21600 seconds)
  if (!redisClient || !redisConnected) {
    return false;
  }
  try {
    const dataStr = JSON.stringify(value);
    await redisClient.set(key, dataStr, 'EX', ttlSeconds);
    return true;
  } catch (error) {
    console.error(`Error writing to Redis cache for key ${key}: ${error.message}`);
    return false;
  }
}

export { redisClient, redisConnected };
export const getRedisConnectionOptions = () => {
  if (!REDIS_URL) return {};
  return {
    connection: {
      url: REDIS_URL,
      maxRetriesPerRequest: null,
    }
  };
};
