// ==========================================================================
// PIN Check — vanilla JS frontend (no build step, no framework)
// Talks to the same Express backend (/api/availability/stream via SSE)
// ==========================================================================

// Relative path so it works in both dev (localhost) and production out-of-the-box
const API_BASE_URL = window.PIN_CHECK_API_BASE || '/api';

const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 10 11 15 8 12"></polyline></svg>',
  xCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
  alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
  loader: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>',
};

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
const state = {
  usePresets: true,
  citiesList: [],         // list of { district, state, label } fetched from backend
  selectedCity: null,     // { district, state, label } currently selected
  allCityPincodes: [],    // list of { pincode, officeNames } for currently selected city
  selectedPincodes: new Set(), // Set of currently checked 6-digit PIN strings
  activeZoneName: null,   // currently selected zone name (string)
  pincodeSearchQuery: '', // filter query string for pincodes list
  isBatchScanning: false, // full-city sequential scan flag
  batchList: [],          // array of pin arrays (chunks of 15)
  currentBatchIdx: 0,     // index of active batch
  batchDelayTimer: null,  // setTimeout reference for inter-batch delay
  results: [],            // array of result objects, in arrival order
  isLoading: false,
  isStreaming: false,
  isRefreshingPin: null,
  productTitle: '',
  platform: '',
  resolvedUrl: '',
  currentEventSource: null,
  loadingRotateTimer: null,
  animatedPins: new Set(),
  failedListExpanded: false,
  availableExpanded: true,
  unavailableExpanded: true,
  scanStartTime: null,
  scanDuration: null,
  timerInterval: null,
  elapsedString: '',
  currentMode: 'presets',
};

// ---------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------
const el = {
  form: document.getElementById('search-form'),
  urlInput: document.getElementById('product-url'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  presetsPanel: document.getElementById('presets-panel'),
  customPanel: document.getElementById('custom-panel'),
  cityInput: document.getElementById('city-input'),
  citiesDropdown: document.getElementById('cities-dropdown'),
  cityError: document.getElementById('city-error'),
  zoneContainer: document.getElementById('zone-container'),
  zoneButtons: document.getElementById('zone-buttons'),
  pincodePanel: document.getElementById('pincode-panel'),
  pincodeSearchInput: document.getElementById('pincode-search'),
  pinCountBadge: document.getElementById('pin-count-badge'),
  selectAllBtn: document.getElementById('select-all-btn'),
  clearAllBtn: document.getElementById('clear-all-btn'),
  pincodeGrid: document.getElementById('pincode-grid'),
  cityScanWrapper: document.getElementById('city-scan-wrapper'),
  cityScanBtn: document.getElementById('city-scan-btn'),
  customPinsInput: document.getElementById('custom-pins'),
  submitBtn: document.getElementById('submit-btn'),
  productHeader: document.getElementById('product-header'),
  productBadges: document.getElementById('product-badges'),
  productTitle: document.getElementById('product-title'),
  productLink: document.getElementById('product-link'),
  exportBtn: document.getElementById('export-btn'),
  emptyState: document.getElementById('empty-state'),
  resultsCard: document.getElementById('results-card'),
  resultsContent: document.getElementById('results-content'),
  todayDate: document.getElementById('today-date'),
};

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
function init() {
  el.todayDate.textContent = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  
  // Fetch cities list on boot
  fetchCities();

  // Attach event listeners
  el.tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.mode)));
  el.cityInput.addEventListener('input', handleCityInput);
  document.addEventListener('click', handleOutsideClick);
  el.pincodeSearchInput.addEventListener('input', handlePincodeSearch);
  el.clearAllBtn.addEventListener('click', clearAllPincodes);
  el.selectAllBtn.addEventListener('click', selectAllFilteredPincodes);
  el.cityScanBtn.addEventListener('click', handleCityScanClick);
  el.form.addEventListener('submit', handleSubmit);
  el.exportBtn.addEventListener('click', exportCSV);

  updateSubmitButtonState();
}

function switchTab(mode) {
  state.currentMode = mode;
  updateModeUI();
}

function updateModeUI() {
  const mode = state.currentMode || 'presets';
  state.usePresets = (mode === 'presets');

  // Toggle tab button active classes
  el.tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

  // Toggle main panel visibility: presets and city-scan use presets panel (which has city input)
  el.presetsPanel.classList.toggle('hidden', mode === 'custom');
  el.customPanel.classList.toggle('hidden', mode !== 'custom');

  // If we are in city presets or city scan modes
  if (mode === 'presets' || mode === 'city-scan') {
    if (state.selectedCity) {
      const cityKey = `${state.selectedCity.district}|${state.selectedCity.state}`;
      const hasZones = window.ZONES_MAP && window.ZONES_MAP[cityKey];

      // "City hubs" mode -> show selection grid, hide scan full city wrapper
      if (mode === 'presets') {
        el.cityScanWrapper.classList.add('hidden');
        if (hasZones) {
          el.zoneContainer.classList.remove('hidden');
        } else {
          el.zoneContainer.classList.add('hidden');
        }
        el.pincodePanel.classList.remove('hidden');
      } 
      // "Scan full city" mode -> hide selection grid, show scan full city wrapper
      else if (mode === 'city-scan') {
        el.zoneContainer.classList.add('hidden');
        el.pincodePanel.classList.add('hidden');
        el.cityScanWrapper.classList.remove('hidden');
      }
    } else {
      // No city selected yet
      el.zoneContainer.classList.add('hidden');
      el.pincodePanel.classList.add('hidden');
      el.cityScanWrapper.classList.add('hidden');
    }
    
    // Toggle submit button: presets mode has check availability, city scan mode does not need it
    el.submitBtn.classList.toggle('hidden', mode === 'city-scan');
  } else {
    // Custom pins mode
    el.submitBtn.classList.remove('hidden');
  }

  updateSubmitButtonState();
}

// ---------------------------------------------------------------------
// API Data loading
// ---------------------------------------------------------------------
async function fetchCities() {
  try {
    const res = await fetch(`${API_BASE_URL}/pincodes/cities`);
    if (!res.ok) throw new Error('Failed to load cities');
    state.citiesList = await res.json();
  } catch (error) {
    console.error('Error loading cities list:', error);
  }
}

async function fetchCityPincodes(district, stateName) {
  try {
    const queryUrl = `${API_BASE_URL}/pincodes/city?district=${encodeURIComponent(district)}&state=${encodeURIComponent(stateName)}`;
    const res = await fetch(queryUrl);
    if (!res.ok) throw new Error('Failed to load pincodes');
    state.allCityPincodes = await res.json();
    
    // Sort pincodes ascending
    state.allCityPincodes.sort((a, b) => a.pincode.localeCompare(b.pincode));

    setupPincodesUI();
  } catch (error) {
    console.error('Error fetching pincodes:', error);
  }
}

// ---------------------------------------------------------------------
// City Autocomplete search input
// ---------------------------------------------------------------------
function handleCityInput() {
  const val = el.cityInput.value.trim();
  if (!val) {
    clearCitySelection();
    return;
  }

  if (val.length < 2) {
    el.citiesDropdown.classList.add('hidden');
    return;
  }

  // Filter list of cities (case-insensitive substring match)
  const query = val.toLowerCase();
  const matches = state.citiesList.filter(c => c.label.toLowerCase().includes(query));
  const limitedMatches = matches.slice(0, 10);

  el.citiesDropdown.classList.remove('hidden');

  if (limitedMatches.length === 0) {
    el.citiesDropdown.innerHTML = `<div class="dropdown-item no-match">No matching city found</div>`;
  } else {
    el.citiesDropdown.innerHTML = limitedMatches.map(city => {
      return `
        <div class="dropdown-item" data-district="${escapeHtmlAttribute(city.district)}" data-state="${escapeHtmlAttribute(city.state)}" data-label="${escapeHtmlAttribute(city.label)}">
          ${escapeHtml(city.label)}
        </div>
      `;
    }).join('');

    // Dropdown selection click handler
    el.citiesDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const label = item.dataset.label;
        el.cityInput.value = label;
        el.citiesDropdown.classList.add('hidden');

        const matched = state.citiesList.find(c => c.label === label);
        if (matched) {
          el.cityError.classList.add('hidden');
          el.cityInput.classList.remove('invalid-input');
          state.selectedCity = matched;
          state.selectedPincodes.clear();
          state.activeZoneName = null;
          fetchCityPincodes(matched.district, matched.state);
        }
        updateSubmitButtonState();
      });
    });
  }
}

function handleOutsideClick(e) {
  if (!el.cityInput.contains(e.target) && !el.citiesDropdown.contains(e.target)) {
    el.citiesDropdown.classList.add('hidden');

    // Strict validation check when click shifts out
    const val = el.cityInput.value.trim();
    if (val) {
      const matched = state.citiesList.find(c => c.label.toUpperCase() === val.toUpperCase());
      if (!matched) {
        el.cityError.classList.remove('hidden');
        el.cityInput.classList.add('invalid-input');
        clearCitySelectionUI();
      } else {
        el.cityInput.value = matched.label;
      }
    } else {
      clearCitySelection();
    }
    updateSubmitButtonState();
  }
}

function clearCitySelection() {
  state.selectedCity = null;
  state.allCityPincodes = [];
  state.selectedPincodes.clear();
  state.activeZoneName = null;
  
  el.cityError.classList.add('hidden');
  el.cityInput.classList.remove('invalid-input');
  clearCitySelectionUI();
  updateSubmitButtonState();
}

function clearCitySelectionUI() {
  el.zoneContainer.classList.add('hidden');
  el.zoneButtons.innerHTML = '';
  el.pincodePanel.classList.add('hidden');
  el.pincodeGrid.innerHTML = '';
  el.cityScanWrapper.classList.add('hidden');
  
  state.pincodeSearchQuery = '';
  el.pincodeSearchInput.value = '';
  updateSelectionBadge();
}

// ---------------------------------------------------------------------
// Zone & Checkbox Selector UI
// ---------------------------------------------------------------------
function setupPincodesUI() {
  const cityKey = `${state.selectedCity.district}|${state.selectedCity.state}`;
  const hasZones = window.ZONES_MAP && window.ZONES_MAP[cityKey];

  // Configure City Scan Button
  const totalPins = state.allCityPincodes.length;
  const batchCount = Math.ceil(totalPins / 15);
  el.cityScanBtn.textContent = `Scan full city (${totalPins} pins · ${batchCount} batch${batchCount !== 1 ? 'es' : ''})`;
  el.cityScanBtn.className = "btn-secondary";
  el.cityScanBtn.style.background = "rgb(var(--stamp-soft))";
  el.cityScanBtn.style.color = "rgb(var(--stamp))";
  el.cityScanBtn.style.borderColor = "rgba(var(--stamp), 0.3)";

  if (hasZones) {
    const zones = window.ZONES_MAP[cityKey];
    const zoneNames = Object.keys(zones);
    
    // Group all predefined zone pincodes to identify ungrouped ones
    const groupedPincodes = new Set();
    zoneNames.forEach(name => {
      zones[name].forEach(pin => groupedPincodes.add(pin));
    });

    // Find ungrouped leftover pincodes
    const ungroupedPincodes = state.allCityPincodes
      .map(p => p.pincode)
      .filter(pin => !groupedPincodes.has(pin));

    let zoneButtonsHtml = zoneNames.map(name => {
      return `<button type="button" class="tab-btn" data-zone="${escapeHtmlAttribute(name)}" style="font-size:12px; padding:6px 12px; border:1px solid rgb(var(--line)); border-radius:3px; background:rgb(var(--paper));">${name}</button>`;
    }).join('');

    // Append 'Other / Ungrouped' tab if leftovers exist
    if (ungroupedPincodes.length > 0) {
      zoneButtonsHtml += `<button type="button" class="tab-btn" data-zone="Other / Ungrouped" style="font-size:12px; padding:6px 12px; border:1px solid rgb(var(--line)); border-radius:3px; background:rgb(var(--paper));">Other / Ungrouped</button>`;
    }

    el.zoneButtons.innerHTML = zoneButtonsHtml;
    
    // Attach click listeners to Zone Buttons
    el.zoneButtons.querySelectorAll('[data-zone]').forEach(btn => {
      btn.addEventListener('click', () => {
        const zoneName = btn.dataset.zone;
        selectZone(zoneName);
      });
    });

    // Automatically select and trigger the first zone
    selectZone(zoneNames[0]);
  } else {
    // No zones mapping -> Bypass zone tier and show flat grid directly
    state.activeZoneName = null;
    state.pincodeSearchQuery = '';
    el.pincodeSearchInput.value = '';
    renderPincodeGrid();
  }

  // Delegate final sub-element visibility (pincode grid, zone tabs, city-scan buttons) to updateModeUI
  updateModeUI();
}

function selectZone(zoneName) {
  state.activeZoneName = zoneName;

  // Clear previous selections to avoid multi-zone overlaps & silent 15-PIN overflow
  state.selectedPincodes.clear();

  // Reset search filter query
  state.pincodeSearchQuery = '';
  el.pincodeSearchInput.value = '';

  // Style the active button
  el.zoneButtons.querySelectorAll('[data-zone]').forEach(btn => {
    const isActive = btn.dataset.zone === zoneName;
    btn.classList.toggle('active', isActive);
    btn.style.borderColor = isActive ? 'rgb(var(--stamp))' : 'rgb(var(--line))';
    btn.style.color = isActive ? 'rgb(var(--stamp))' : 'rgb(var(--ink-soft))';
  });

  const filteredPincodes = getActivePincodesList();

  // Auto-check all pincodes of this zone up to 15 maximum
  filteredPincodes.forEach((p, idx) => {
    if (idx < 15) {
      state.selectedPincodes.add(p.pincode);
    }
  });

  el.pincodePanel.classList.remove('hidden');
  renderPincodeGrid();
  updateSelectionBadge();
  updateSubmitButtonState();
}

function getActivePincodesList() {
  if (!state.selectedCity) return [];
  const cityKey = `${state.selectedCity.district}|${state.selectedCity.state}`;
  const hasZones = window.ZONES_MAP && window.ZONES_MAP[cityKey];

  if (!hasZones) {
    return state.allCityPincodes;
  }

  const zoneName = state.activeZoneName;
  if (!zoneName) return [];

  if (zoneName === 'Other / Ungrouped') {
    const zones = window.ZONES_MAP[cityKey];
    const groupedPincodes = new Set();
    Object.keys(zones).forEach(name => {
      zones[name].forEach(pin => groupedPincodes.add(pin));
    });
    return state.allCityPincodes.filter(p => !groupedPincodes.has(p.pincode));
  } else {
    const zonePins = window.ZONES_MAP[cityKey][zoneName] || [];
    return state.allCityPincodes.filter(p => zonePins.includes(p.pincode));
  }
}

function handlePincodeSearch(e) {
  state.pincodeSearchQuery = e.target.value.trim().toLowerCase();
  renderPincodeGrid();
}

function renderPincodeGrid() {
  let list = getActivePincodesList();

  if (state.pincodeSearchQuery) {
    const q = state.pincodeSearchQuery;
    list = list.filter(item => {
      return item.pincode.includes(q) || item.officeNames.toLowerCase().includes(q);
    });
  }

  if (list.length === 0) {
    el.pincodeGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;font-size:12px;color:rgb(var(--ink-soft));padding:16px;">No pincodes match your filter</div>`;
    return;
  }

  el.pincodeGrid.innerHTML = list.map(item => {
    const isChecked = state.selectedPincodes.has(item.pincode);
    const shortLabel = item.officeNames.split(',')[0].trim();
    
    return `
      <label class="city-btn ${isChecked ? 'selected' : ''}" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
        <span class="city-name" style="pointer-events:none;">
          <span class="checkbox">${isChecked ? ICONS.check : ''}</span>
          ${item.pincode}
        </span>
        <input type="checkbox" value="${item.pincode}" ${isChecked ? 'checked' : ''} style="display:none;" />
        <span class="city-count" style="font-size:8.5px; opacity:0.8; max-width:50%; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtmlAttribute(item.officeNames)}">
          ${shortLabel}
        </span>
      </label>
    `;
  }).join('');

  // Attach change listeners to Pincode Grid labels
  el.pincodeGrid.querySelectorAll('label').forEach(labelEl => {
    labelEl.addEventListener('click', (e) => {
      e.preventDefault(); // Stop default label double triggering
      const input = labelEl.querySelector('input');
      const pin = input.value;
      
      togglePincodeSelection(pin, labelEl);
    });
  });
}

function togglePincodeSelection(pin, labelEl) {
  const checkbox = labelEl.querySelector('input');
  
  if (state.selectedPincodes.has(pin)) {
    state.selectedPincodes.delete(pin);
    labelEl.classList.remove('selected');
    labelEl.querySelector('.checkbox').innerHTML = '';
    checkbox.checked = false;
  } else {
    // Strict 15-PIN validation check
    if (state.selectedPincodes.size >= 15) {
      alert('Selection limit reached. You can check a maximum of 15 pincodes total. Please deselect some pins first.');
      return;
    }
    state.selectedPincodes.add(pin);
    labelEl.classList.add('selected');
    labelEl.querySelector('.checkbox').innerHTML = ICONS.check;
    checkbox.checked = true;
  }
  updateSelectionBadge();
  updateSubmitButtonState();
}

function selectAllFilteredPincodes() {
  const visibleInputs = el.pincodeGrid.querySelectorAll('input[type="checkbox"]');
  let newlyChecked = 0;
  
  // Try checking all visible checkboxes up to 15 cap
  for (const input of visibleInputs) {
    const pin = input.value;
    if (!state.selectedPincodes.has(pin)) {
      if (state.selectedPincodes.size >= 15) {
        alert(`Selection cap reached! Checked pins limited to 15.`);
        break;
      }
      state.selectedPincodes.add(pin);
      newlyChecked++;
    }
  }

  renderPincodeGrid();
  updateSelectionBadge();
  updateSubmitButtonState();
}

function clearAllPincodes() {
  state.selectedPincodes.clear();
  
  // Re-render visible grid to uncheck boxes
  const visibleLabels = el.pincodeGrid.querySelectorAll('label');
  visibleLabels.forEach(labelEl => {
    labelEl.classList.remove('selected');
    labelEl.querySelector('.checkbox').innerHTML = '';
    labelEl.querySelector('input').checked = false;
  });

  updateSelectionBadge();
  updateSubmitButtonState();
}

function updateSelectionBadge() {
  const count = state.selectedPincodes.size;
  el.pinCountBadge.textContent = `${count} / 15 PINS SELECTED`;
  el.pinCountBadge.className = `badge ${count > 0 ? 'badge-active' : 'badge-neutral'}`;
}

function updateSubmitButtonState() {
  if (state.isLoading || state.isBatchScanning) {
    el.submitBtn.disabled = true;
    return;
  }

  if (state.usePresets) {
    const hasValidCity = state.selectedCity !== null;
    const hasPincodesChecked = state.selectedPincodes.size > 0;
    el.submitBtn.disabled = !hasValidCity || !hasPincodesChecked;
  } else {
    el.submitBtn.disabled = false;
  }
}

function setFormDisabled(disabled) {
  el.urlInput.disabled = disabled;
  el.tabBtns.forEach(b => (b.disabled = disabled));
  el.cityInput.disabled = disabled;
  el.pincodeSearchInput.disabled = disabled;
  el.zoneButtons.querySelectorAll('button').forEach(b => (b.disabled = disabled));
  el.pincodeGrid.querySelectorAll('label').forEach(label => {
    label.style.pointerEvents = disabled ? 'none' : 'auto';
    label.style.opacity = disabled ? '0.7' : '1';
  });
  el.selectAllBtn.disabled = disabled;
  el.clearAllBtn.disabled = disabled;
  el.customPinsInput.disabled = disabled;
  el.submitBtn.disabled = disabled;
  el.cityScanBtn.disabled = disabled;
  updateSubmitButtonState();
}

// ---------------------------------------------------------------------
// Full City Auto-scanner Sequential Batching & Cancellation
// ---------------------------------------------------------------------
function handleCityScanClick() {
  if (state.isBatchScanning) {
    cancelCityScan();
    return;
  }

  const url = el.urlInput.value.trim();
  if (!url) {
    alert('Please enter a product URL first.');
    return;
  }

  if (state.allCityPincodes.length === 0) return;

  // Split all pincodes into sequential chunks of 15
  const pins = state.allCityPincodes;
  const batches = [];
  for (let i = 0; i < pins.length; i += 15) {
    batches.push(pins.slice(i, i + 15));
  }

  // Set scanning state
  state.isBatchScanning = true;
  state.batchList = batches;
  state.currentBatchIdx = 0;
  state.results = []; // start fresh
  state.failedListExpanded = false;
  state.targetPincodes = pins.map(p => p.pincode);
  state.animatedPins = new Set();
  state.isLoading = false;
  state.isStreaming = true;
  state.productTitle = '';
  state.platform = '';
  state.resolvedUrl = url;

  // Start timer
  state.scanStartTime = Date.now();
  state.scanDuration = null;
  state.elapsedString = '0s';
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(updateRunningTimer, 1000);

  // Update form inputs and toggle scan button to Cancel state
  setFormDisabled(true);
  el.cityScanBtn.disabled = false; // keep scan button active to allow cancel
  el.cityScanBtn.textContent = 'Cancel scan';
  el.cityScanBtn.style.background = 'rgb(var(--unavailable-bg))';
  el.cityScanBtn.style.color = 'rgb(var(--unavailable))';
  el.cityScanBtn.style.borderColor = 'rgb(var(--unavailable-line))';

  el.emptyState.classList.add('hidden');
  el.resultsCard.classList.remove('hidden');
  
  renderResults();

  // Launch sequential batch loop
  runNextBatch(url);
}

function cancelCityScan() {
  if (!state.isBatchScanning) return;
  
  // Abort active stream
  if (state.currentEventSource) {
    state.currentEventSource.close();
    state.currentEventSource = null;
  }

  // Clear timeout to prevent race triggers
  clearTimeout(state.batchDelayTimer);
  state.batchDelayTimer = null;

  state.isBatchScanning = false;
  state.isLoading = false;
  state.isStreaming = false;

  // Clear timer
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.scanDuration = Date.now() - state.scanStartTime;
  state.elapsedString = formatDuration(state.scanDuration);

  // Restore UI elements and button style
  setFormDisabled(false);
  setupPincodesUI(); 
  renderProductHeader();
  renderResults();
}

function runNextBatch(url) {
  // Guard check to prevent trigger if user canceled inside delay window
  if (!state.isBatchScanning) return;

  if (state.currentBatchIdx >= state.batchList.length) {
    // All batches completed!
    state.isBatchScanning = false;
    state.isLoading = false;
    state.isStreaming = false;

    // Clear timer
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    state.scanDuration = Date.now() - state.scanStartTime;
    state.elapsedString = formatDuration(state.scanDuration);
    
    setFormDisabled(false);
    setupPincodesUI();
    renderProductHeader();
    renderResults();
    return;
  }

  const batchPins = state.batchList[state.currentBatchIdx];
  const batchPinStrings = batchPins.map(p => p.pincode);

  // Format dynamic location name summary (e.g. Gomti Nagar, Chowk +13 more)
  const visibleCount = Math.min(2, batchPins.length);
  const shortNames = batchPins.slice(0, visibleCount).map(p => p.officeNames.split(',')[0].trim());
  const remainder = batchPins.length - visibleCount;
  const progressLabel = shortNames.join(', ') + (remainder > 0 ? ` +${remainder} more` : '');

  updateProgressHeader(`Batch ${state.currentBatchIdx + 1} / ${state.batchList.length} scanning... (${progressLabel})`);

  const queryUrl = `${API_BASE_URL}/availability/stream?url=${encodeURIComponent(url)}&pins=${encodeURIComponent(batchPinStrings.join(','))}`;
  const es = new EventSource(queryUrl);
  state.currentEventSource = es;

  es.addEventListener('meta', (e) => {
    try {
      const meta = JSON.parse(e.data);
      state.platform = meta.platform;
      state.resolvedUrl = meta.resolvedUrl || url;
      renderProductHeader();
    } catch (_) {}
  });

  es.addEventListener('result', (e) => {
    if (!state.isBatchScanning) {
      es.close();
      return;
    }
    try {
      const result = JSON.parse(e.data);
      if (result.productTitle && result.productTitle !== 'Unknown Product') {
        state.productTitle = result.productTitle;
      }
      
      // Deduplicate result array by removing existing matches
      state.results = state.results.filter(r => r.pincode !== result.pincode);
      state.results.push(result);
      state.animatedPins.add(result.pincode);
      renderProductHeader();
      renderResults();
    } catch (_) {}
  });

  const handleBatchCompletion = () => {
    es.close();
    state.currentEventSource = null;
    
    if (!state.isBatchScanning) return;

    // Trigger next batch after 1.5s delay
    state.currentBatchIdx++;
    state.batchDelayTimer = setTimeout(() => {
      runNextBatch(url);
    }, 1500);
  };

  es.addEventListener('done', () => {
    handleBatchCompletion();
  });

  es.addEventListener('error', (e) => {
    let errMsg = 'Connection to server lost.';
    try {
      const parsed = JSON.parse(e.data || '{}');
      if (parsed.error) errMsg = parsed.error;
    } catch (_) {}

    // Resiliency fallback: Mark non-returned pins as unverified
    const donePinsInBatch = new Set(state.results.map(r => r.pincode));
    batchPinStrings.forEach(pin => {
      if (!donePinsInBatch.has(pin)) {
        state.results = state.results.filter(r => r.pincode !== pin);
        state.results.push({
          productId: 'error', productTitle: 'Failed Query', pincode: pin,
          status: "Couldn't verify", deliveryDate: null,
          scrapedAt: new Date().toISOString(), source: 'live', error: errMsg,
        });
      }
    });

    renderResults();
    handleBatchCompletion();
  });
}

function updateProgressHeader(text) {
  const textEl = document.getElementById('loading-text-el');
  if (textEl) {
    textEl.textContent = text;
  } else {
    const container = document.getElementById('results-content');
    if (container) {
      container.innerHTML = `
        <div class="results-loading-banner">
          <span>${ICONS.refresh.replace('<svg', '<svg class="icon" style="animation:spin 1s linear infinite"')} <span id="loading-text-el">${text}</span></span>
        </div>
      `;
    }
  }
}

// ---------------------------------------------------------------------
// Submit / search manual selection
// ---------------------------------------------------------------------
function handleSubmit(e) {
  e.preventDefault();
  const url = el.urlInput.value.trim();
  if (!url) return;

  let pins = [];
  if (state.usePresets) {
    pins = Array.from(state.selectedPincodes);
  } else {
    pins = el.customPinsInput.value.split(',').map(p => p.trim()).filter(p => /^\d{6}$/.test(p));
    if (pins.length > 15) {
      alert('Query limit exceeded. You can check a maximum of 15 custom PIN codes.');
      return;
    }
  }

  if (pins.length === 0) {
    alert('Please select or enter at least one valid 6-digit PIN code.');
    return;
  }

  startSearch(url, pins);
}

function startSearch(url, pincodes) {
  if (state.currentEventSource) {
    state.currentEventSource.close();
    state.currentEventSource = null;
  }
  clearInterval(state.loadingRotateTimer);

  state.targetPincodes = pincodes;
  state.results = [];
  state.animatedPins = new Set();
  state.failedListExpanded = false;
  state.isLoading = true;
  state.isStreaming = false;
  state.resolvedUrl = url;

  // Start timer
  state.scanStartTime = Date.now();
  state.scanDuration = null;
  state.elapsedString = '0s';
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(updateRunningTimer, 1000);

  setFormDisabled(true);
  el.emptyState.classList.add('hidden');
  el.resultsCard.classList.remove('hidden');
  renderResults();
  startLoadingTextRotation();

  const pinsParam = pincodes.join(',');
  const queryUrl = `${API_BASE_URL}/availability/stream?url=${encodeURIComponent(url)}&pins=${encodeURIComponent(pinsParam)}`;
  const es = new EventSource(queryUrl);
  state.currentEventSource = es;

  es.addEventListener('meta', (e) => {
    try {
      const meta = JSON.parse(e.data);
      state.platform = meta.platform;
      state.resolvedUrl = meta.resolvedUrl || url;
      state.isLoading = false;
      state.isStreaming = true;
      clearInterval(state.loadingRotateTimer);
      renderProductHeader();
      renderResults();
    } catch (_) {}
  });

  es.addEventListener('result', (e) => {
    try {
      const result = JSON.parse(e.data);
      if (result.productTitle && result.productTitle !== 'Unknown Product') {
        state.productTitle = result.productTitle;
      }
      state.results.push(result);
      state.animatedPins.add(result.pincode);
      renderProductHeader();
      renderResults();
    } catch (_) {}
  });

  es.addEventListener('done', () => {
    es.close();
    state.currentEventSource = null;
    state.isLoading = false;
    state.isStreaming = false;
    setFormDisabled(false);

    // Clear timer
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    state.scanDuration = Date.now() - state.scanStartTime;
    state.elapsedString = formatDuration(state.scanDuration);

    renderProductHeader();
    renderResults();
  });

  es.addEventListener('error', (e) => {
    let errMsg = 'Connection to server lost.';
    try {
      const parsed = JSON.parse(e.data || '{}');
      if (parsed.error) errMsg = parsed.error;
    } catch (_) {}

    const donePins = new Set(state.results.map(r => r.pincode));
    pincodes.filter(p => !donePins.has(p)).forEach(pin => {
      state.results.push({
        productId: 'error', productTitle: 'Failed Query', pincode: pin,
        status: "Couldn't verify", deliveryDate: null,
        scrapedAt: new Date().toISOString(), source: 'live', error: errMsg,
      });
    });

    es.close();
    state.currentEventSource = null;
    state.isLoading = false;
    state.isStreaming = false;
    setFormDisabled(false);

    // Clear timer
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    state.scanDuration = Date.now() - state.scanStartTime;
    state.elapsedString = formatDuration(state.scanDuration);

    renderProductHeader();
    renderResults();
  });
}

function refreshPin(pin) {
  if (!state.resolvedUrl) return;
  state.isRefreshingPin = pin;
  renderResults();

  const queryUrl = `${API_BASE_URL}/availability/stream?url=${encodeURIComponent(state.resolvedUrl)}&pins=${encodeURIComponent(pin)}`;
  const es = new EventSource(queryUrl);

  es.addEventListener('result', (e) => {
    try {
      const result = JSON.parse(e.data);
      state.results = state.results.map(r => (r.pincode === pin ? result : r));
      renderResults();
    } catch (_) {}
  });

  es.addEventListener('done', () => {
    es.close();
    state.isRefreshingPin = null;
    renderResults();
  });

  es.addEventListener('error', () => {
    es.close();
    state.isRefreshingPin = null;
    alert(`Failed to refresh PIN ${pin}.`);
    renderResults();
  });
}

function retryAllFailed() {
  const failedPins = state.results.filter(r => r.status === "Couldn't verify").map(r => r.pincode);
  if (failedPins.length === 0) return;

  // Filter out the failed results so they show up as pending/scanning again
  state.results = state.results.filter(r => r.status !== "Couldn't verify");
  
  state.isLoading = false;
  state.isStreaming = true;
  setFormDisabled(true);
  renderProductHeader();
  renderResults();

  const url = el.urlInput.value.trim() || state.resolvedUrl;
  const pinsParam = failedPins.join(',');
  const queryUrl = `${API_BASE_URL}/availability/stream?url=${encodeURIComponent(url)}&pins=${encodeURIComponent(pinsParam)}`;
  const es = new EventSource(queryUrl);
  state.currentEventSource = es;

  es.addEventListener('result', (e) => {
    try {
      const result = JSON.parse(e.data);
      state.results = state.results.filter(r => r.pincode !== result.pincode);
      state.results.push(result);
      state.animatedPins.add(result.pincode);
      renderResults();
    } catch (_) {}
  });

  es.addEventListener('done', () => {
    es.close();
    state.currentEventSource = null;
    state.isStreaming = false;
    setFormDisabled(false);
    renderProductHeader();
    renderResults();
  });

  es.addEventListener('error', (e) => {
    let errMsg = 'Connection to server lost.';
    try {
      const parsed = JSON.parse(e.data || '{}');
      if (parsed.error) errMsg = parsed.error;
    } catch (_) {}

    const donePins = new Set(state.results.map(r => r.pincode));
    failedPins.filter(p => !donePins.has(p)).forEach(pin => {
      state.results.push({
        productId: 'error', productTitle: 'Failed Query', pincode: pin,
        status: "Couldn't verify", deliveryDate: null,
        scrapedAt: new Date().toISOString(), source: 'live', error: errMsg,
      });
    });

    es.close();
    state.currentEventSource = null;
    state.isStreaming = false;
    setFormDisabled(false);
    renderProductHeader();
    renderResults();
  });
}

// ---------------------------------------------------------------------
// Loading text rotation (manual single-scan checks fallback)
// ---------------------------------------------------------------------
function startLoadingTextRotation() {
  let idx = 0;
  const banner = () => document.getElementById('loading-text-el');
  state.loadingRotateTimer = setInterval(() => {
    if (!state.isLoading || state.targetPincodes.length === 0) return;
    const pin = state.targetPincodes[idx];
    const hubName = getHubName(pin);
    const label = hubName !== 'Custom location' ? `${hubName} hub` : 'location';
    const b = banner();
    if (b) b.textContent = `Checking ${label} (${pin})...`;
    idx = (idx + 1) % state.targetPincodes.length;
  }, 1800);
}

// ---------------------------------------------------------------------
// Rendering — product header
// ---------------------------------------------------------------------
function renderProductHeader() {
  const hasSearched = state.targetPincodes.length > 0;
  const showHeader = hasSearched && (state.results.length > 0 || state.platform);
  el.productHeader.classList.toggle('hidden', !showHeader);
  if (!showHeader) return;

  const pendingCount = state.targetPincodes.filter(p => !state.results.some(r => r.pincode === p)).length;

  let badges = '';
  if (state.platform) {
    badges += `<span class="tag tag-platform">${state.platform}</span>`;
  }
  if (state.isStreaming && pendingCount > 0) {
    badges += `<span class="tag tag-scanning"><span class="dot"></span> Scanning ${pendingCount} PIN${pendingCount !== 1 ? 's' : ''}…</span>`;
  }
  el.productBadges.innerHTML = badges;

  el.productTitle.textContent = state.productTitle || (state.isStreaming ? 'Fetching product info…' : 'Product');
  el.productLink.href = state.resolvedUrl || '#';

  const showExport = !state.isStreaming && state.results.length > 0;
  el.exportBtn.classList.toggle('hidden', !showExport);
}

// ---------------------------------------------------------------------
// Rendering — results grid
// ---------------------------------------------------------------------
function getRelativeTime(timestampStr) {
  try {
    const diffMs = Date.now() - new Date(timestampStr).getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    const diffHours = Math.floor(diffMins / 60);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ago`;
  } catch (_) {
    return 'cached';
  }
}

function statusClass(status) {
  if (status === 'Available') return 'available';
  if (status === 'Unavailable') return 'unavailable';
  return 'failed';
}

function statusIcon(status) {
  if (status === 'Available') return ICONS.checkCircle;
  if (status === 'Unavailable') return ICONS.xCircle;
  return ICONS.alertTriangle;
}

function renderResults() {
  const hasSearched = state.targetPincodes.length > 0;
  if (!hasSearched) {
    el.resultsCard.classList.add('hidden');
    return;
  }
  el.resultsCard.classList.remove('hidden');

  // 1. Full loading skeleton (before first meta/result)
  if (state.isLoading) {
    el.resultsContent.innerHTML = `
      <div class="results-loading-banner">
        <span>${ICONS.refresh.replace('<svg', '<svg class="icon" style="animation:spin 1s linear infinite"')} <span id="loading-text-el">Initializing search context...</span></span>
      </div>
      <div class="result-grid loading-grid">
        ${state.targetPincodes.map(() => `
          <div class="skeleton-card2">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div style="flex:1 1 auto;display:flex;flex-direction:column;gap:6px;">
                <div class="skeleton-line" style="width:75%;"></div>
                <div class="skeleton-line" style="width:50%;height:8px;"></div>
              </div>
              <div class="skeleton-circle"></div>
            </div>
            <div class="skeleton-line" style="width:85%;"></div>
            <div class="skeleton-line" style="width:33%;height:8px;align-self:flex-end;"></div>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  // 2. Streaming or has results
  const total = state.targetPincodes.length;
  const scanned = state.results.length;
  const pending = total - scanned;
  const available = state.results.filter(r => r.status === 'Available').length;
  const unavailable = state.results.filter(r => r.status === 'Unavailable').length;
  const unverified = state.results.filter(r => r.status === "Couldn't verify").length;

  const isFinished = !state.isStreaming && !state.isLoading && !state.isRefreshingPin;
  let headerLabel = '';
  if (isFinished && state.scanStartTime) {
    headerLabel = `<strong>${total}</strong> pincode${total !== 1 ? 's' : ''} checked in <strong>${state.elapsedString}</strong>`;
  } else {
    headerLabel = `
      <strong>${scanned}</strong> scanned / <strong>${total}</strong> total
      ${available > 0 ? ` &middot; <span style="color:rgb(var(--available))"><strong>${available}</strong> available</span>` : ''}
      ${unavailable > 0 ? ` &middot; <span style="color:rgb(var(--unavailable))"><strong>${unavailable}</strong> unavailable</span>` : ''}
      ${unverified > 0 ? ` &middot; <span style="color:rgb(var(--pending))"><strong>${unverified}</strong> unverified</span>` : ''}
    `;
  }

  let html = `
    <div class="results-header" style="flex-direction: column; align-items: stretch; gap: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <h2>Results manifest</h2>
          <span id="scan-timer-el" style="font-size: 11px; color: rgb(var(--ink-soft)); font-weight: 500;">
            ${(state.isStreaming || state.isLoading) && state.scanStartTime ? `Elapsed: ${state.elapsedString}` : (state.scanDuration ? `Completed in ${state.elapsedString}` : '')}
          </span>
        </div>
        <span class="results-count" style="font-size: 12px;">${headerLabel}</span>
      </div>
      <div class="progress-container">
        <div class="progress-track">
          <div class="progress-segment available" style="width: ${(available / total) * 100}%"></div>
          <div class="progress-segment unavailable" style="width: ${(unavailable / total) * 100}%"></div>
          <div class="progress-segment failed" style="width: ${(unverified / total) * 100}%"></div>
          <div class="progress-segment pending" style="width: ${(pending / total) * 100}%"></div>
        </div>
      </div>
    </div>
  `;

  // Collapsible Failed list (replaces old static partial-warning banner)
  if (unverified > 0) {
    html += `
      <div class="collapsible-wrapper">
        <div class="collapsible-header ${state.failedListExpanded ? 'open' : ''}" id="failed-collapsible-trigger">
          <svg class="chevron icon" style="transform: ${state.failedListExpanded ? 'rotate(90deg)' : 'none'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <span>${state.failedListExpanded ? 'Hide' : 'Show'} ${unverified} unverified location${unverified !== 1 ? 's' : ''}</span>
        </div>
        <div class="collapsible-content ${state.failedListExpanded ? 'open' : ''}">
          <div style="display: flex; justify-content: flex-end; padding-bottom: 8px; border-bottom: 1px dashed rgb(var(--line)); margin-bottom: 8px;">
            <button type="button" class="failed-retry-btn" id="retry-all-failed-btn" style="padding: 6px 12px; font-weight: 600; border-color: rgba(var(--pending), 0.5); color: rgb(var(--pending)); background: rgba(var(--pending), 0.05);" ${state.isStreaming ? 'disabled' : ''}>
              ${ICONS.refresh} Retry All (${unverified})
            </button>
          </div>
          ${state.results.filter(r => r.status === "Couldn't verify").map(r => `
            <div class="failed-item">
              <div class="failed-info">
                <div class="failed-pin-row">
                  <span class="failed-pin">${r.pincode}</span>
                  <span class="failed-hub">${getHubName(r.pincode)}</span>
                </div>
                <div class="failed-error" title="${escapeHtmlAttribute(r.error)}">${escapeHtml(r.error || 'Scrape timeout')}</div>
              </div>
              <button type="button" class="failed-retry-btn" data-retry-pin="${r.pincode}">
                ${ICONS.refresh} Retry
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  const availableResults = state.results.filter(r => r.status === 'Available');
  const unavailableResults = state.results.filter(r => r.status === 'Unavailable');

  // 3. Deliverable (Available) Locations Collapsible Section
  if (availableResults.length > 0 || state.isStreaming) {
    const showContent = state.availableExpanded;
    html += `
      <div class="section-collapsible-wrapper available">
        <div class="section-collapsible-header ${showContent ? 'open' : ''}" id="available-collapsible-trigger">
          <svg class="chevron icon" style="transform: ${showContent ? 'rotate(90deg)' : 'none'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <span>Deliverable Locations (${availableResults.length})</span>
        </div>
        <div class="section-collapsible-content ${showContent ? 'open' : ''}">
          <div class="result-grid">
            ${availableResults.map(result => renderCardHTML(result)).join('')}
            ${availableResults.length === 0 && !state.isStreaming ? '<p style="color:rgb(var(--ink-soft));font-size:12px;margin:0;">No deliverable locations found.</p>' : ''}
          </div>
        </div>
      </div>
    `;
  }

  // 4. Non-Deliverable (Unavailable) Locations Collapsible Section
  if (unavailableResults.length > 0) {
    const showContent = state.unavailableExpanded;
    html += `
      <div class="section-collapsible-wrapper unavailable">
        <div class="section-collapsible-header ${showContent ? 'open' : ''}" id="unavailable-collapsible-trigger">
          <svg class="chevron icon" style="transform: ${showContent ? 'rotate(90deg)' : 'none'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <span>Non-Deliverable Locations (${unavailableResults.length})</span>
        </div>
        <div class="section-collapsible-content ${showContent ? 'open' : ''}">
          <div class="result-grid">
            ${unavailableResults.map(result => renderCardHTML(result)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 5. Active Scanning Skeleton (if streaming)
  if (state.isStreaming) {
    const pendingPins = state.targetPincodes.filter(pin => !state.results.some(r => r.pincode === pin));
    if (pendingPins.length > 0) {
      html += `
        <div style="margin-top: 14px; margin-bottom: 16px;">
          <h3 style="font-size:12px;font-weight:600;color:rgb(var(--ink-soft));margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span class="dot" style="background:rgb(var(--ink-soft));animation:pulse 1.2s infinite"></span> Scanning... (${pendingPins.length} remaining)
          </h3>
          <div class="result-grid">
            ${pendingPins.map(pin => renderSkeletonCardHTML(pin)).join('')}
          </div>
        </div>
      `;
    }
  }

  el.resultsContent.innerHTML = html;

  // Bind click triggers for collapsibles
  const availableTrigger = el.resultsContent.querySelector('#available-collapsible-trigger');
  if (availableTrigger) {
    availableTrigger.addEventListener('click', () => {
      state.availableExpanded = !state.availableExpanded;
      renderResults();
    });
  }

  const unavailableTrigger = el.resultsContent.querySelector('#unavailable-collapsible-trigger');
  if (unavailableTrigger) {
    unavailableTrigger.addEventListener('click', () => {
      state.unavailableExpanded = !state.unavailableExpanded;
      renderResults();
    });
  }

  const failedTrigger = el.resultsContent.querySelector('#failed-collapsible-trigger');
  if (failedTrigger) {
    failedTrigger.addEventListener('click', () => {
      state.failedListExpanded = !state.failedListExpanded;
      renderResults();
    });
  }

  const retryAllBtn = el.resultsContent.querySelector('#retry-all-failed-btn');
  if (retryAllBtn) {
    retryAllBtn.addEventListener('click', () => {
      retryAllFailed();
    });
  }

  // Bind inline retry buttons inside the collapsible list
  el.resultsContent.querySelectorAll('[data-retry-pin]').forEach(btn => {
    btn.addEventListener('click', () => refreshPin(btn.dataset.retryPin));
  });

  // Bind standard card refresh buttons
  el.resultsContent.querySelectorAll('[data-refresh-pin]').forEach(btn => {
    btn.addEventListener('click', () => refreshPin(btn.dataset.refreshPin));
  });
}

function renderCardHTML(result) {
  const cls = statusClass(result.status);
  const isFailed = result.status === "Couldn't verify";
  const isAvailable = result.status === 'Available';
  const isNew = state.animatedPins.has(result.pincode) && state.isStreaming;
  const showRefresh = result.source === 'cache' || isFailed;
  const isRefreshingThis = state.isRefreshingPin === result.pincode;

  return `
    <div class="result-card ${cls} ${isNew ? 'new-card' : ''}">
      <div class="rc-top">
        <div style="min-width:0;">
          <h3 class="rc-hub">${getHubName(result.pincode)}</h3>
          <p class="rc-pin">${result.pincode}</p>
        </div>
        <div class="rc-actions">
          ${showRefresh ? `
            <button type="button" class="refresh-btn ${isRefreshingThis ? 'spinning' : ''}" title="Force refresh"
              data-refresh-pin="${result.pincode}" ${state.isRefreshingPin !== null ? 'disabled' : ''}>
              ${ICONS.refresh}
            </button>` : ''}
          <span class="postmark ${cls}">${statusIcon(result.status)}</span>
        </div>
      </div>
      <div class="rc-body">
        <div class="rc-status-row">
          <span class="status-pill ${cls}">${result.status}</span>
          ${result.source === 'cache' ? `<span class="rc-cached-time">${getRelativeTime(result.scrapedAt)}</span>` : ''}
        </div>
        ${isAvailable ? `<p class="rc-delivery">${result.deliveryDate || 'Delivery available'}</p>` : ''}
        ${isFailed ? `<p class="rc-error">${escapeHtml(result.error || 'Scrape timeout')}</p>` : ''}
      </div>
    </div>
  `;
}

function renderSkeletonCardHTML(pin) {
  return `
    <div class="result-card skeleton-card">
      <div class="rc-top">
        <div style="min-width:0;">
          <h3 class="rc-hub">${getHubName(pin)}</h3>
          <p class="rc-pin">${pin}</p>
        </div>
        <div class="skeleton-loader">${ICONS.loader}</div>
      </div>
      <div class="rc-body">
        <span class="scanning-label"><span class="dot"></span> Scanning...</span>
        <div class="skeleton-bar"></div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------
function exportCSV() {
  if (state.results.length === 0) return;

  const headers = ['Pincode', 'Location', 'Status', 'Delivery Date/Details', 'Source', 'Checked At'];
  const rows = state.results.map(r => [
    r.pincode,
    `${getHubName(r.pincode)}${getHubName(r.pincode) !== 'Custom location' ? ` (${r.pincode})` : ''}`,
    r.status,
    r.deliveryDate || 'N/A',
    r.source,
    new Date(r.scrapedAt).toLocaleString(),
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const productId = state.results[0]?.productId || 'export';
  link.href = url;
  link.download = `availability_report_${productId}_${new Date().toISOString().split('T')[0]}.csv`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------
// Helpers to resolve Location names dynamically
// ---------------------------------------------------------------------
function getHubName(pin) {
  if (state.allCityPincodes && state.allCityPincodes.length > 0) {
    const match = state.allCityPincodes.find(p => p.pincode === pin);
    if (match) {
      return match.officeNames.split(',')[0].trim();
    }
  }
  return 'Custom location';
}

function escapeHtmlAttribute(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function updateRunningTimer() {
  if (!state.scanStartTime) return;
  const elapsedMs = Date.now() - state.scanStartTime;
  state.elapsedString = formatDuration(elapsedMs);
  
  const timerEl = document.getElementById('scan-timer-el');
  if (timerEl) {
    timerEl.textContent = `Elapsed: ${state.elapsedString}`;
  }
}

// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);
