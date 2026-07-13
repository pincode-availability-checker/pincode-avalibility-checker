import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { ScrapedResult, PRESET_HUBS } from './SearchBar.tsx';

interface StatusGridProps {
  results: ScrapedResult[];
  isLoading: boolean;
  targetPincodes: string[];
  onRefreshPin: (pin: string) => void;
  isRefreshingPin: string | null;
}

export default function StatusGrid({
  results,
  isLoading,
  targetPincodes,
  onRefreshPin,
  isRefreshingPin
}: StatusGridProps) {
  const [loadingText, setLoadingText] = useState('Initializing search context...');

  // Cycle through PINs being checked to display active feedback
  useEffect(() => {
    if (!isLoading) return;
    
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (targetPincodes.length === 0) return;
      const currentPin = targetPincodes[currentIndex];
      const hub = PRESET_HUBS.find(h => h.pin === currentPin);
      const hubName = hub ? `${hub.name} hub` : 'location';
      setLoadingText(`Checking ${hubName} (${currentPin})...`);
      currentIndex = (currentIndex + 1) % targetPincodes.length;
    }, 1800);

    return () => clearInterval(interval);
  }, [isLoading, targetPincodes]);

  // Helper to find the hub name from a PIN code
  const getHubName = (pin: string) => {
    const hub = PRESET_HUBS.find(h => h.pin === pin);
    return hub ? hub.name : `PIN ${pin}`;
  };

  // Helper to calculate relative time since check
  const getRelativeTime = (timestampStr: string) => {
    try {
      const parsedDate = new Date(timestampStr);
      const diffMs = new Date().getTime() - parsedDate.getTime();
      const diffMins = Math.max(0, Math.floor(diffMs / 60000));
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'Checked just now';
      if (diffMins < 60) return `Checked ${diffMins}m ago`;
      return `Checked ${diffHours}h ago`;
    } catch (e) {
      return 'Cached';
    }
  };

  // 1. Loading Skeleton Grid
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Pulsing loading progress banner */}
        <div className="flex items-center justify-center p-4 bg-amber-50 border border-amber-200 rounded-md">
          <span className="text-sm text-amber-500 font-medium animate-pulse flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
            {loadingText}
          </span>
        </div>

        {/* Skeleton Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {targetPincodes.map((pin) => (
            <div
              key={pin}
              className="flex flex-col p-4 rounded-md border border-slate-200 bg-white shadow-sm animate-pulse space-y-3"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2 w-2/3">
                  <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                </div>
                <div className="rounded-full bg-slate-200 h-8 w-8"></div>
              </div>
              <div className="h-4 bg-slate-200 rounded w-5/6"></div>
              <div className="h-3 bg-slate-200 rounded w-1/3 self-end"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) return null;

  // Calculate summary counts
  const total = results.length;
  const failed = results.filter(r => r.status === "Couldn't verify").length;
  const available = results.filter(r => r.status === 'Available').length;
  
  const hasFailures = failed > 0;
  const isPartial = failed > 0 && failed < total;

  return (
    <div className="space-y-4">
      {/* Grid Header Summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-2">
        <h2 className="text-lg font-semibold text-slate-800">Results Map</h2>
        <span className="text-xs font-medium text-slate-500 font-mono">
          {available} of {total} hubs available
          {hasFailures && ` · ${failed} failed to verify`}
        </span>
      </div>

      {/* Partial Failure Warning Banner */}
      {isPartial && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Partial results displayed.</span> Some locations could not be verified due to scrape timeouts. You can click the retry icon on failed cards to check again.
          </div>
        </div>
      )}

      {/* Actual Results Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {results.map((result) => {
          const isAvailable = result.status === 'Available';
          const isUnavailable = result.status === 'Unavailable';
          const isFailed = result.status === "Couldn't verify";

          let cardStyle = "border-slate-200 bg-white";
          let statusBadge = "";
          let StatusIcon = AlertTriangle;

          if (isAvailable) {
            cardStyle = "bg-emerald-50 border-emerald-200 text-emerald-900";
            statusBadge = "text-emerald-700 bg-emerald-100/50";
            StatusIcon = CheckCircle2;
          } else if (isUnavailable) {
            cardStyle = "bg-rose-50 border-rose-200 text-rose-950";
            statusBadge = "text-rose-700 bg-rose-100/50";
            StatusIcon = XCircle;
          } else if (isFailed) {
            cardStyle = "bg-amber-50 border-amber-200 text-amber-900";
            statusBadge = "text-amber-800 bg-amber-100/50";
            StatusIcon = AlertTriangle;
          }

          return (
            <div
              key={result.pincode}
              className={`flex flex-col p-4 rounded-md border shadow-sm relative group hover:shadow-md transition-shadow ${cardStyle}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{getHubName(result.pincode)}</h3>
                  <p className="text-xs text-slate-500 font-mono font-medium">{result.pincode}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Refresh Button for Cache or failed states */}
                  {(result.source === 'cache' || isFailed) && (
                    <button
                      type="button"
                      title="Force refresh"
                      onClick={() => onRefreshPin(result.pincode)}
                      disabled={isRefreshingPin !== null}
                      className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 focus-visible:ring-2 focus-visible:ring-blue-600 focus:outline-none disabled:opacity-40"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          isRefreshingPin === result.pincode ? 'animate-spin text-blue-600' : ''
                        }`}
                      />
                    </button>
                  )}
                  <StatusIcon className={`w-5 h-5 shrink-0 ${
                    isAvailable ? 'text-emerald-600' : isUnavailable ? 'text-rose-600' : 'text-amber-600'
                  }`} />
                </div>
              </div>

              {/* Status details & Delivery text */}
              <div className="flex-grow mt-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusBadge}`}>
                    {result.status}
                  </span>
                  
                  {result.source === 'cache' && (
                    <span className="text-[10px] text-slate-500 font-medium font-mono">
                      {getRelativeTime(result.scrapedAt)}
                    </span>
                  )}
                </div>

                {isAvailable && (
                  <p className="text-xs font-semibold text-emerald-800">
                    🚚 {result.deliveryDate || 'Delivery available'}
                  </p>
                )}

                {isFailed && (
                  <p className="text-[11px] text-amber-700 italic max-h-16 overflow-y-auto pr-1">
                    Error: {result.error || 'Scrape timeout'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
