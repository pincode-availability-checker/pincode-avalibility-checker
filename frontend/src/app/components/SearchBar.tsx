import React, { useState } from 'react';
import { Search, MapPin, Check } from 'lucide-react';

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
    <form onSubmit={handleSubmit} className="w-full space-y-5">
      {/* Product URL Input */}
      <div className="space-y-1.5">
        <label className="block text-[10px] font-bold uppercase tracking-widest text-ink-soft font-mono">
          Consignment / Product URL
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-ink-soft" />
          </div>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.amazon.in/dp/... or https://www.flipkart.com/..."
            className="w-full rounded-sm border border-line focus:border-stamp bg-paper text-base pl-10 pr-4 py-3 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-stamp/40 focus-visible:outline-none placeholder:text-ink-soft/60"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Selector Mode Tabs */}
      <div className="flex border-b border-line gap-1">
        <button
          type="button"
          onClick={() => setUsePresets(true)}
          className={`flex items-center gap-2 py-2 px-3 border-b-2 font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-stamp/40 focus:outline-none ${
            usePresets
              ? 'border-stamp text-stamp'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
          disabled={isLoading}
        >
          <MapPin className="w-4 h-4" />
          City hubs
        </button>
        <button
          type="button"
          onClick={() => setUsePresets(false)}
          className={`flex items-center gap-2 py-2 px-3 border-b-2 font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-stamp/40 focus:outline-none ${
            !usePresets
              ? 'border-stamp text-stamp'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
          disabled={isLoading}
        >
          <Search className="w-4 h-4" />
          Custom PINs
        </button>
      </div>

      {usePresets ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-sm font-mono border ${
              selectedPinsCount > 0
                ? 'bg-available-bg text-available border-available-line'
                : 'bg-unavailable-bg text-unavailable border-unavailable-line'
            }`}>
              {selectedPinsCount} / 15 PINS SELECTED
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={isLoading}
                className="text-stamp hover:underline font-medium focus:outline-none disabled:opacity-40"
              >
                Auto-fill (max 15)
              </button>
              <span className="text-line">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={isLoading}
                className="text-ink-soft hover:text-ink hover:underline font-medium focus:outline-none disabled:opacity-40"
              >
                Clear all
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
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-sm border text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-stamp/40 focus:outline-none ${
                    isSelected
                      ? 'bg-stamp-soft border-stamp/40 text-stamp shadow-sm'
                      : 'bg-paper border-line text-ink-soft hover:border-ink-soft hover:text-ink'
                  }`}
                >
                  <span className="truncate mr-1 flex items-center gap-1">
                    <span className={`w-3 h-3 rounded-[2px] border shrink-0 flex items-center justify-center ${
                      isSelected ? 'bg-stamp border-stamp' : 'border-ink-soft/50'
                    }`}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-paper-raised" strokeWidth={3} />}
                    </span>
                    {hub.name}
                  </span>
                  <span className="font-mono text-[9px] text-ink-soft shrink-0">
                    {hub.pins.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-ink-soft font-mono">
            6-digit PIN codes, comma-separated (max 15)
          </label>
          <input
            type="text"
            value={customPins}
            onChange={(e) => setCustomPins(e.target.value)}
            placeholder="e.g., 400001, 110001, 560001, 600001"
            className="w-full rounded-sm border border-line focus:border-stamp bg-paper text-sm px-3 py-2.5 shadow-sm transition-colors font-mono focus-visible:ring-2 focus-visible:ring-stamp/40 focus-visible:outline-none placeholder:text-ink-soft/60"
            disabled={isLoading}
          />
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-center pt-1">
        <button
          type="submit"
          disabled={isLoading || (usePresets && selectedPinsCount === 0)}
          className="w-full md:w-auto min-w-[220px] bg-ink text-paper-raised rounded-sm px-6 py-2.5 font-medium hover:bg-stamp shadow-sm focus-visible:ring-2 focus-visible:ring-stamp/40 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 tracking-wide"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Checking {usePresets ? `${selectedPinsCount} PINs` : 'custom locations'}…
            </>
          ) : (
            'Check availability'
          )}
        </button>
      </div>
    </form>
  );
}
