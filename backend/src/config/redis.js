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

// ── In-memory fallback cache (used when Redis is unavailable) ──────────────
const memCache = new Map(); // key → { value, expiresAt }

function memGet(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key, value, ttlSeconds) {
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ── Try to connect Redis — give up after 3 retries ────────────────────────
if (REDIS_URL) {
  let retryCount = 0;
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ
      retryStrategy(times) {
        retryCount = times;
        if (times > 3) {
          console.warn('Redis: gave up connecting after 3 retries. Using in-memory cache.');
          return null; // Stop retrying
        }
        return Math.min(times * 500, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => console.log('Redis connecting...'));
    redisClient.on('ready', () => {
      redisConnected = true;
      console.log('Redis connection established and ready');
    });
    redisClient.on('error', (err) => {
      if (redisConnected || retryCount <= 1) {
        console.error(`Redis Error: ${err.message}`);
      }
      redisConnected = false;
    });
    redisClient.on('close', () => {
      if (redisConnected) console.warn('Redis connection closed');
      redisConnected = false;
    });

    // Attempt connection (lazyConnect means it won't auto-connect)
    redisClient.connect().catch(() => {
      console.warn('Redis unavailable — falling back to in-memory cache.');
    });

  } catch (error) {
    console.error(`Failed to initialize Redis client: ${error.message}`);
    redisClient = null;
  }
} else {
  console.warn('REDIS_URL not set — using in-memory cache.');
}

// ── Unified cache helpers (Redis → in-memory fallback) ────────────────────
export async function getCache(key) {
  // Try Redis first
  if (redisClient && redisConnected) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (_) {}
  }
  // Fallback to in-memory
  const val = memGet(key);
  return val ? JSON.parse(val) : null;
}

export async function setCache(key, value, ttlSeconds = 21600) {
  const serialized = JSON.stringify(value);
  // Try Redis first
  if (redisClient && redisConnected) {
    try {
      await redisClient.set(key, serialized, 'EX', ttlSeconds);
      return true;
    } catch (_) {}
  }
  // Fallback to in-memory
  memSet(key, serialized, ttlSeconds);
  return true;
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
