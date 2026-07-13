import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { connectMongo } from './config/mongo.js';
import { redisClient } from './config/redis.js';
import apiRouter from './routes/api.js';
import { worker } from './queue/worker.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*', // Allow all origins for simplicity in dev/testing, configure properly for production
}));

app.use(express.json());

// Express Rate Limiter: Cap queries to 3 requests per hour per IP as per PRD
const apiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many queries from this IP. Anonymous requests are limited to 3 per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiter specifically to availability checks
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

// Initialize database connections and start server
async function startServer() {
  console.log('Initializing services...');
  
  // Connect to MongoDB
  await connectMongo();

  // Start Express listener
  const server = app.listen(PORT, () => {
    console.log(`Backend Express server is running on port ${PORT}`);
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
