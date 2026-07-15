// ==========================================================================
// Static Manual Zone Mapping config for major cities (keyed by DISTRICT|STATE)
// Any city not defined here will bypass the zone layer and render flat PINs.
// ==========================================================================

window.ZONES_MAP = {
  "LUCKNOW|UTTAR PRADESH": {
    "Lucknow West": ["226003", "226004", "226005", "226011"],
    "Lucknow East": ["226010", "226015", "226016", "226019"],
    "Lucknow North": ["226006", "226020", "226021", "226024"],
    "Lucknow South": ["226002", "226012", "226014", "226025"],
    "Lucknow Central": ["226001", "226018", "226022"]
  },
  "MUMBAI|MAHARASHTRA": {
    "South Mumbai": ["400001", "400002", "400003", "400004", "400005", "400021"],
    "South Central": ["400007", "400008", "400011", "400012", "400013", "400033"]
  },
  "MUMBAI SUBURBAN|MAHARASHTRA": {
    "Western Suburbs": ["400049", "400050", "400052", "400053", "400054", "400056", "400058"],
    "Eastern Suburbs": ["400071", "400072", "400074", "400075", "400076", "400077"]
  },
  "NEW DELHI|DELHI": {
    "Central New Delhi": ["110001", "110002", "110003"]
  },
  "WEST|DELHI": {
    "West Delhi Area": ["110015", "110018", "110027", "110058"]
  },
  "SOUTH|DELHI": {
    "South Delhi Area": ["110016", "110017", "110019", "110024"]
  },
  "NORTH|DELHI": {
    "North Delhi Area": ["110006", "110007", "110009", "110054"]
  },
  "EAST|DELHI": {
    "East Delhi Area": ["110091", "110092", "110095", "110096"]
  }
};
