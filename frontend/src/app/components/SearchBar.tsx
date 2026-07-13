import React, { useState } from 'react';
import { Search, MapPin, Check, Plus } from 'lucide-react';

interface SearchBarProps {
  onSearch: (url: string, pincodes: string[]) => void;
  isLoading: boolean;
}

export const PRESET_HUBS = [
  { name: 'Delhi', pins: ['110001', '110011', '110021'] },
  { name: 'Mumbai', pins: ['400001', '400050', '400072'] },
  { name: 'Bengaluru', pins: ['560001', '560037', '560102'] },
  { name: 'Chennai', pins: ['600001', '600018', '600040'] },
  { name: 'Kolkata', pins: ['700001', '700020', '700091'] },
  { name: 'Hyderabad', pins: ['500001', '500032', '500081'] },
  { name: 'Pune', pins: ['411001', '411007', '411014'] },
  { name: 'Ahmedabad', pins: ['380001', '380009', '380015'] },
  { name: 'Jaipur', pins: ['302001', '302015', '302017'] },
  { name: 'Lucknow', pins: ['226001', '226010', '226016'] },
  { name: 'Patna', pins: ['800001', '800008', '800013'] },
  { name: 'Chandigarh', pins: ['160001', '160017', '160022'] },
  { name: 'Guwahati', pins: ['781001', '781005', '781012'] },
  { name: 'Bhopal', pins: ['462001', '462016', '462023'] },
  { name: 'Kochi', pins: ['682001', '682016', '682025'] }
];

export default function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [url, setUrl] = useState('');
  const [customPins, setCustomPins] = useState('');
  const [usePresets, setUsePresets] = useState(true);
  
  // Default to selecting Delhi and Mumbai (6 PINs total)
  const [selectedCities, setSelectedCities] = useState<string[]>(['Delhi', 'Mumbai']);

  const getSelectedPinsCount = (cities: string[]) => {
    return cities.reduce((acc, cName) => {
      const city = PRESET_HUBS.find(h => h.name === cName);
      return acc + (city ? city.pins.length : 0);
    }, 0);
  };

  const handleToggleCity = (cityName: string) => {
    if (selectedCities.includes(cityName)) {
      setSelectedCities(selectedCities.filter(c => c !== cityName));
    } else {
      const targetCity = PRESET_HUBS.find(h => h.name === cityName);
      const targetPinsCount = targetCity ? targetCity.pins.length : 0;
      const currentPinsCount = getSelectedPinsCount(selectedCities);

      if (currentPinsCount + targetPinsCount > 15) {
        alert(`Selecting ${cityName} will exceed the 15-PIN search limit (Current selection contains ${currentPinsCount} PINs).`);
        return;
      }
      setSelectedCities([...selectedCities, cityName]);
    }
  };

  const handleSelectAll = () => {
    // Select first few cities that fit in the 15 PIN limit (e.g. first 5 cities = 15 PINs)
    let count = 0;
    const citiesToSelect: string[] = [];
    for (const city of PRESET_HUBS) {
      if (count + city.pins.length <= 15) {
        citiesToSelect.push(city.name);
        count += city.pins.length;
      }
    }
    setSelectedCities(citiesToSelect);
  };

  const handleDeselectAll = () => {
    setSelectedCities([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    let pinsList: string[] = [];

    if (usePresets) {
      // Flatten selected cities to their PIN codes
      pinsList = PRESET_HUBS
        .filter(h => selectedCities.includes(h.name))
        .flatMap(h => h.pins);
    } else {
      pinsList = customPins
        .split(',')
        .map(p => p.trim())
        .filter(p => /^\d{6}$/.test(p));
        
      if (pinsList.length > 15) {
        alert('Query limit exceeded. You can check a maximum of 15 custom PIN codes.');
        return;
      }
    }

    if (pinsList.length === 0) {
      alert('Please select or enter at least one valid 6-digit PIN code.');
      return;
    }

    onSearch(url, pinsList);
  };

  const selectedPinsCount = getSelectedPinsCount(selectedCities);

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">
      {/* Product URL Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste Amazon.in or Flipkart.com product URL..."
          className="w-full rounded-lg border-2 border-slate-300 focus:border-blue-600 focus:ring-0 text-base md:text-lg pl-10 pr-4 py-3 shadow-sm transition-colors font-sans focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
          disabled={isLoading}
        />
      </div>

      {/* Selector Mode Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setUsePresets(true)}
          className={`flex items-center gap-2 py-2 px-4 border-b-2 font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus:outline-none ${
            usePresets
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          disabled={isLoading}
        >
          <MapPin className="w-4 h-4" />
          Check City-Wise
        </button>
        <button
          type="button"
          onClick={() => setUsePresets(false)}
          className={`flex items-center gap-2 py-2 px-4 border-b-2 font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus:outline-none ${
            !usePresets
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          disabled={isLoading}
        >
          <Search className="w-4 h-4" />
          Custom PIN Codes
        </button>
      </div>

      {/* Target PIN inputs based on selection */}
      {usePresets ? (
        <div className="bg-white p-4 rounded-md border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">Select Cities (Each expands to regional PINs):</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                selectedPinsCount > 0 ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
              }`}>
                {selectedPinsCount} / 15 PINs selected
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={isLoading}
                className="text-blue-600 hover:text-blue-700 hover:underline font-medium focus:outline-none disabled:opacity-40"
              >
                Auto Fill (Max 15 PINs)
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={isLoading}
                className="text-slate-500 hover:text-slate-700 hover:underline font-medium focus:outline-none disabled:opacity-40"
              >
                Clear All
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
            {PRESET_HUBS.map((hub) => {
              const isSelected = selectedCities.includes(hub.name);
              return (
                <button
                  key={hub.name}
                  type="button"
                  onClick={() => handleToggleCity(hub.name)}
                  disabled={isLoading}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus:outline-none ${
                    isSelected
                      ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  <span className="truncate mr-1">{hub.name}</span>
                  <span className="font-mono text-[9px] text-slate-400 shrink-0 flex items-center gap-0.5">
                    {isSelected ? <Check className="w-2.5 h-2.5 text-blue-600" /> : <Plus className="w-2.5 h-2.5 text-slate-400" />}
                    {hub.pins.length} PINs
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">Custom 6-digit PIN Codes (comma-separated, max 15):</label>
          <input
            type="text"
            value={customPins}
            onChange={(e) => setCustomPins(e.target.value)}
            placeholder="e.g., 400001, 110001, 560001, 600001"
            className="w-full rounded-md border border-slate-300 focus:border-blue-600 focus:ring-0 text-sm px-3 py-2 shadow-sm transition-colors font-mono focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
            disabled={isLoading}
          />
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-center pt-2">
        <button
          type="submit"
          disabled={isLoading || (usePresets && selectedPinsCount === 0)}
          className="w-full md:w-auto min-w-[200px] bg-blue-600 text-white rounded-md px-6 py-2.5 font-medium hover:bg-blue-700 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Checking {usePresets ? `${selectedPinsCount} PINs` : 'Custom Locations'}...
            </>
          ) : (
            'Check Availability'
          )}
        </button>
      </div>
    </form>
  );
}
