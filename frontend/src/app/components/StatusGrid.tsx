import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { ScrapedResult } from '../../services/apiClient';
import { PRESET_HUBS } from './SearchBar';

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

  useEffect(() => {
    if (!isLoading) return;

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (targetPincodes.length === 0) return;
      const currentPin = targetPincodes[currentIndex];
      const hub = PRESET_HUBS.find(h => h.pins.includes(currentPin));
      const hubName = hub ? `${hub.name} hub` : 'location';
      setLoadingText(`Checking ${hubName} (${currentPin})...`);
      currentIndex = (currentIndex + 1) % targetPincodes.length;
    }, 1800);

    return () => clearInterval(interval);
  }, [isLoading, targetPincodes]);

  const getHubName = (pin: string) => {
    const hub = PRESET_HUBS.find(h => h.pins.includes(pin));
    return hub ? hub.name : 'Custom location';
  };

  const getRelativeTime = (timestampStr: string) => {
    try {
      const parsedDate = new Date(timestampStr);
      const diffMs = new Date().getTime() - parsedDate.getTime();
      const diffMins = Math.max(0, Math.floor(diffMs / 60000));
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      return `${diffHours}h ago`;
    } catch (e) {
      return 'cached';
    }
  };

  // 1. Loading Skeleton Grid
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center p-4 bg-pending-bg border border-dashed border-pending-line rounded-sm">
          <span className="text-sm text-pending font-medium animate-pulse flex items-center gap-2 font-mono">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {loadingText}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {targetPincodes.map((pin) => (
            <div
              key={pin}
              className="flex flex-col p-4 rounded-sm border border-line bg-paper-raised shadow-sm animate-pulse space-y-3"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2 w-2/3">
                  <div className="h-4 bg-line rounded w-3/4"></div>
                  <div className="h-3 bg-line rounded w-1/2"></div>
                </div>
                <div className="rounded-full bg-line h-9 w-9"></div>
              </div>
              <div className="h-4 bg-line rounded w-5/6"></div>
              <div className="h-3 bg-line rounded w-1/3 self-end"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) return null;

  const total = results.length;
  const failed = results.filter(r => r.status === "Couldn't verify").length;
  const available = results.filter(r => r.status === 'Available').length;

  const hasFailures = failed > 0;
  const isPartial = failed > 0 && failed < total;

  return (
    <div className="space-y-4">
      {/* Grid Header Summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-line pb-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-soft font-mono">
          Results manifest
        </h2>
        <span className="text-xs font-medium text-ink-soft font-mono">
          {available} / {total} hubs available
          {hasFailures && ` · ${failed} unverified`}
        </span>
      </div>

      {isPartial && (
        <div className="p-3 bg-pending-bg border border-pending-line text-pending text-xs rounded-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Partial results displayed.</span> Some locations could not be
            verified due to scrape timeouts. Use the retry icon on unverified cards to check again.
          </div>
        </div>
      )}

      {/* Waybill-stub result cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {results.map((result) => {
          const isAvailable = result.status === 'Available';
          const isUnavailable = result.status === 'Unavailable';
          const isFailed = result.status === "Couldn't verify";

          let cardStyle = "border-line bg-paper-raised";
          let stampColor = "text-ink-soft border-ink-soft/60";
          let StatusIcon = AlertTriangle;

          if (isAvailable) {
            cardStyle = "bg-available-bg border-available-line";
            stampColor = "text-available border-available";
            StatusIcon = CheckCircle2;
          } else if (isUnavailable) {
            cardStyle = "bg-unavailable-bg border-unavailable-line";
            stampColor = "text-unavailable border-unavailable";
            StatusIcon = XCircle;
          } else if (isFailed) {
            cardStyle = "bg-pending-bg border-pending-line";
            stampColor = "text-pending border-pending";
            StatusIcon = AlertTriangle;
          }

          return (
            <div
              key={result.pincode}
              className={`perforated flex flex-col pl-5 pr-4 py-4 rounded-sm border shadow-sm relative group hover:shadow-md transition-shadow ${cardStyle}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-ink truncate">{getHubName(result.pincode)}</h3>
                  <p className="text-sm text-ink-soft font-mono font-semibold tracking-wide">{result.pincode}</p>
                </div>
                <div className="flex items-start gap-1.5 shrink-0">
                  {(result.source === 'cache' || isFailed) && (
                    <button
                      type="button"
                      title="Force refresh"
                      onClick={() => onRefreshPin(result.pincode)}
                      disabled={isRefreshingPin !== null}
                      className="p-1 rounded-full text-ink-soft hover:text-ink hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-stamp/40 focus:outline-none disabled:opacity-40"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          isRefreshingPin === result.pincode ? 'animate-spin text-stamp' : ''
                        }`}
                      />
                    </button>
                  )}
                  <span
                    className={`postmark w-10 h-10 text-[8px] font-bold font-mono uppercase leading-tight text-center ${stampColor}`}
                  >
                    <StatusIcon className="w-4 h-4" />
                  </span>
                </div>
              </div>

              <div className="flex-grow mt-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider font-mono border ${stampColor} bg-paper-raised/60`}>
                    {result.status}
                  </span>

                  {result.source === 'cache' && (
                    <span className="text-[10px] text-ink-soft font-medium font-mono">
                      {getRelativeTime(result.scrapedAt)}
                    </span>
                  )}
                </div>

                {isAvailable && (
                  <p className="text-xs font-semibold text-available">
                    {result.deliveryDate || 'Delivery available'}
                  </p>
                )}

                {isFailed && (
                  <p className="text-[11px] text-pending italic max-h-16 overflow-y-auto pr-1">
                    {result.error || 'Scrape timeout'}
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
