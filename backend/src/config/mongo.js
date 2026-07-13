import mongoose from 'mongoose';
import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

export async function connectMongo() {
  if (!MONGODB_URI) {
    console.error('CRITICAL: MONGODB_URI is not defined in the environment variables.');
    return null;
  }

  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    // Do not crash the entire application immediately, let it run and retry or degrade
    return null;
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('error', (err) => {
  console.error(`MongoDB connection error event: ${err.message}`);
});
