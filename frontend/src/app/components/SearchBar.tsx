import React, { useState } from 'react';
import { Search, MapPin, Check, Plus } from 'lucide-react';

interface SearchBarProps {
  onSearch: (url: string, pincodes: string[]) => void;
  isLoading: boolean;
}

export const PRESET_HUBS = [
  { name: 'Delhi', pin: '110001' },
  { name: 'Mumbai', pin: '400001' },
  { name: 'Bengaluru', pin: '560001' },
  { name: 'Chennai', pin: '600001' },
  { name: 'Kolkata', pin: '700001' },
  { name: 'Hyderabad', pin: '500001' },
  { name: 'Pune', pin: '411001' },
  { name: 'Ahmedabad', pin: '380001' },
  { name: 'Jaipur', pin: '302001' },
  { name: 'Lucknow', pin: '226001' },
  { name: 'Patna', pin: '800001' },
  { name: 'Chandigarh', pin: '160001' },
  { name: 'Guwahati', pin: '781001' },
  { name: 'Bhopal', pin: '462001' },
  { name: 'Kochi', pin: '682001' }
];

export default function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [url, setUrl] = useState('');
  const [customPins, setCustomPins] = useState('');
  const [usePresets, setUsePresets] = useState(true);
  const [selectedPins, setSelectedPins] = useState<string[]>(PRESET_HUBS.map(h => h.pin));

  const handleTogglePin = (pin: string) => {
    if (selectedPins.includes(pin)) {
      setSelectedPins(selectedPins.filter(p => p !== pin));
    } else {
      if (selectedPins.length >= 15) {
        alert('Query limit reached. You can select a maximum of 15 cities.');
        return;
      }
      setSelectedPins([...selectedPins, pin]);
    }
  };

  const handleSelectAll = () => {
    setSelectedPins(PRESET_HUBS.map(h => h.pin).slice(0, 15));
  };

  const handleDeselectAll = () => {
    setSelectedPins([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    let pinsList: string[] = [];

    if (usePresets) {
      pinsList = selectedPins;
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
              <span className="text-xs font-semibold text-slate-700">Select Cities to Check:</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                selectedPins.length > 0 ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
              }`}>
                {selectedPins.length} / 15 selected
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={isLoading}
                className="text-blue-600 hover:text-blue-700 hover:underline font-medium focus:outline-none disabled:opacity-40"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={isLoading}
                className="text-slate-500 hover:text-slate-700 hover:underline font-medium focus:outline-none disabled:opacity-40"
              >
                Deselect All
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
            {PRESET_HUBS.map((hub) => {
              const isSelected = selectedPins.includes(hub.pin);
              return (
                <button
                  key={hub.pin}
                  type="button"
                  onClick={() => handleTogglePin(hub.pin)}
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
                    {hub.pin}
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
          disabled={isLoading || (usePresets && selectedPins.length === 0)}
          className="w-full md:w-auto min-w-[200px] bg-blue-600 text-white rounded-md px-6 py-2.5 font-medium hover:bg-blue-700 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Checking {usePresets ? `${selectedPins.length} Locations` : 'Custom Locations'}...
            </>
          ) : (
            'Check Availability'
          )}
        </button>
      </div>
    </form>
  );
}
