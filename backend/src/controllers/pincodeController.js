import { getAllCities, getPincodesByCity } from '../config/pincodeDb.js';

/**
 * Returns all unique, sorted city combinations (district + state).
 */
export async function getCities(req, res) {
  try {
    const cities = getAllCities();
    return res.status(200).json(cities);
  } catch (error) {
    console.error(`Error in getCities controller: ${error.message}`);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * Returns pincodes under a specific district + state combination.
 * Expects district and state in query parameters.
 */
export async function getCityPincodes(req, res) {
  try {
    const { district, state } = req.query;

    if (!district || !state) {
      // Graceful return empty array for missing parameters instead of throwing/crashing
      return res.status(200).json([]);
    }

    const pincodes = getPincodesByCity(district, state);
    return res.status(200).json(pincodes);
  } catch (error) {
    console.error(`Error in getCityPincodes controller: ${error.message}`);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
