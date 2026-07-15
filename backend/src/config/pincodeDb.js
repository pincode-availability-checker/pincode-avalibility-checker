import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map keyed by unique "DISTRICT_NAME|STATE_NAME" to hold array of pincode records
const pincodeMap = new Map();

// Sorted list of unique cities for the dropdown autocomplete
let cityList = [];

/**
 * Parses the master pincode CSV file on startup and populates the in-memory maps.
 */
export function loadPincodeDb() {
  const csvPath = path.resolve(__dirname, '../../../master_pincode_database_v2.csv');
  console.log(`[PincodeDB] Loading master pincode database from: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`[PincodeDB] CRITICAL ERROR: CSV file not found at ${csvPath}`);
    return;
  }

  try {
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    
    // Parse using csv-parse with options
    const records = parse(fileContent, {
      columns: true, // Use header row
      skip_empty_lines: true,
      trim: true
    });

    console.log(`[PincodeDB] Parsed ${records.length} total rows from CSV.`);

    // Temporary set to collect unique keys for list generation
    const uniqueCities = new Set();

    for (const row of records) {
      const pincode = row.pincode ? row.pincode.trim() : '';
      const state = row.state ? row.state.trim().toUpperCase() : '';
      const district = row.district ? row.district.trim().toUpperCase() : '';
      const officeNames = row.office_names ? row.office_names.trim() : '';

      if (!pincode || !district || !state) continue;

      const comboKey = `${district}|${state}`;
      let label = `${district} (${state})`;
      if (district === 'KHERI' && state === 'UTTAR PRADESH') {
        label = `LAKHIMPUR KHERI (UTTAR PRADESH)`;
      } else if (district === 'SPSR NELLORE' && state === 'ANDHRA PRADESH') {
        label = `NELLORE / SPSR NELLORE (ANDHRA PRADESH)`;
      } else if (district === 'Y.S.R.' && state === 'ANDHRA PRADESH') {
        label = `KADAPA / Y.S.R. (ANDHRA PRADESH)`;
      } else if (district === 'PRAYAGRAJ' && state === 'UTTAR PRADESH') {
        label = `PRAYAGRAJ / ALLAHABAD (UTTAR PRADESH)`;
      } else if (district === 'AYODHYA' && state === 'UTTAR PRADESH') {
        label = `AYODHYA / FAIZABAD (UTTAR PRADESH)`;
      } else if (district === 'BENGALURU URBAN' && state === 'KARNATAKA') {
        label = `BANGALORE / BENGALURU URBAN (KARNATAKA)`;
      } else if (district === 'BENGALURU RURAL' && state === 'KARNATAKA') {
        label = `BANGALORE / BENGALURU RURAL (KARNATAKA)`;
      } else if (district === 'NUH' && state === 'HARYANA') {
        label = `NUH / MEWAT (HARYANA)`;
      }

      if (!pincodeMap.has(comboKey)) {
        pincodeMap.set(comboKey, []);
      }

      pincodeMap.get(comboKey).push({
        pincode,
        officeNames
      });

      if (!uniqueCities.has(comboKey)) {
        uniqueCities.add(comboKey);
        cityList.push({
          district,
          state,
          label
        });
      }
    }

    // Sort the unique cities list alphabetically by label
    cityList.sort((a, b) => a.label.localeCompare(b.label));

    console.log(`[PincodeDB] Successfully loaded ${pincodeMap.size} unique district-state combos.`);
  } catch (error) {
    console.error(`[PincodeDB] Error parsing CSV database: ${error.message}`);
  }
}

/**
 * Returns all sorted unique city objects.
 * @returns {Array<{district: string, state: string, label: string}>}
 */
export function getAllCities() {
  return cityList;
}

/**
 * Returns the list of pincodes for a specific district and state.
 * Returns an empty array if not found.
 * @param {string} district 
 * @param {string} state 
 * @returns {Array<{pincode: string, officeNames: string}>}
 */
export function getPincodesByCity(district, state) {
  if (!district || !state) return [];
  const key = `${district.toUpperCase()}|${state.toUpperCase()}`;
  return pincodeMap.get(key) || [];
}
