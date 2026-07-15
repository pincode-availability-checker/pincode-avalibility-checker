import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { connectMongo } from './config/mongo.js';
import { redisClient } from './config/redis.js';
import apiRouter from './routes/api.js';
import { worker } from './queue/worker.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars from current Cwd, backend root, or root workspace
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*', // Allow all origins for simplicity in dev/testing, configure properly for production
}));

app.use(express.json());

// Serve static frontend files from public folder
app.use(express.static(path.resolve(__dirname, '../public')));

// Rate limiter for availability endpoints — 60 requests per hour per IP
const apiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60,
  message: { error: 'Rate limit reached. Maximum 60 requests per hour per IP.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiter to availability checks only
app.use('/api/availability', apiRateLimiter);

// Register main API routes
app.use('/api', apiRouter);

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error(`Unhandled Express Error: ${err.stack}`);
  
  // Strip stack trace in production as required
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'An unexpected error occurred.' 
    : err.message;
    
  res.status(500).json({ error: errorMessage });
});

// Avoid Crashing the Main Thread: handle unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error(`CRITICAL: Unhandled Rejection at: ${promise}, reason: ${reason}`);
  // Keep the server running instead of crashing
});

process.on('uncaughtException', (err) => {
  console.error(`CRITICAL: Uncaught Exception thrown: ${err.message}`);
  console.error(err.stack);
  // Keep the server running instead of crashing
});

import { loadPincodeDb } from './config/pincodeDb.js';

// Initialize database connections and start server
async function startServer() {
  console.log('Initializing services...');
  
  // Load master pincodes database CSV
  loadPincodeDb();
  
  // Connect to MongoDB
  await connectMongo();

  // Start Express listener
  const server = app.listen(PORT, () => {
    console.log(`Backend Express server is running on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`CRITICAL ERROR: Port ${PORT} is already in use. Please terminate any process on this port or change the PORT env variable.`);
      process.exit(1);
    } else {
      console.error(`Server Error: ${err.message}`);
    }
  });

  // Graceful shutdown handler
  const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    
    server.close(() => {
      console.log('Express HTTP server closed.');
    });

    if (worker) {
      await worker.close();
      console.log('BullMQ worker closed.');
    }

    if (redisClient) {
      await redisClient.quit();
      console.log('Redis client connection closed.');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();
