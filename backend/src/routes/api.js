import express from 'express';
import { checkAvailability, streamAvailability, checkMetrics } from '../controllers/availabilityController.js';
import { getCities, getCityPincodes } from '../controllers/pincodeController.js';

const router = express.Router();

// Regional Product Availability Check endpoint (returns all results at once)
router.get('/availability', checkAvailability);

// SSE streaming endpoint — sends each PIN result as it's scraped
router.get('/availability/stream', streamAvailability);

// Monitoring metrics endpoint
router.get('/metrics', checkMetrics);

// Pincode database search routes
router.get('/pincodes/cities', getCities);
router.get('/pincodes/city', getCityPincodes);

export default router;
