import express from 'express';
import { checkAvailability, checkMetrics } from '../controllers/availabilityController.js';

const router = express.Router();

// Regional Product Availability Check endpoint
router.get('/availability', checkAvailability);

// Monitoring metrics endpoint
router.get('/metrics', checkMetrics);

export default router;
