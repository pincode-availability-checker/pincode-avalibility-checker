'use client';

import React, { useState } from 'react';
import { PackageSearch, ShieldAlert } from 'lucide-react';
import SearchBar from './components/SearchBar';
import StatusGrid from './components/StatusGrid';
import ExportBtn from './components/ExportBtn';
import { fetchAvailability, ScrapedResult } from '../services/apiClient';

export default function Dashboard() {
  const [url, setUrl] = useState('');
  const [targetPincodes, setTargetPincodes] = useState<string[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingPin, setIsRefreshingPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [productTitle, setProductTitle] = useState('');
  const [platform, setPlatform] = useState('');

  const handleSearch = async (productUrl: string, pincodes: string[]) => {
    setUrl(productUrl);
    setTargetPincodes(pincodes);
    setIsLoading(true);
    setError(null);
    setResults([]);
    setProductTitle('');
    setPlatform('');

    try {
      const data = await fetchAvailability(productUrl, pincodes);
      setResults(data.results);
      setProductTitle(data.productTitle || 'Product');
      setPlatform(data.platform || '');
    } catch (err: any) {
      setError(err.message || 'Scraper failed to initialize. Please check your URL and network.');
      setResults(
        pincodes.map(pin => ({
          productId: 'error',
          productTitle: 'Failed Query',
          pincode: pin,
          status: "Couldn't verify",
          deliveryDate: null,
          scrapedAt: new Date().toISOString(),
          source: 'live',
          error: err.message || 'Scrape connection error'
        }))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshPin = async (pin: string) => {
    if (!url) return;
    setIsRefreshingPin(pin);

    try {
      const data = await fetchAvailability(url, [pin]);
      if (data.results && data.results.length > 0) {
        const freshResult = data.results[0];
        setResults(prevResults =>
          prevResults.map(r => (r.pincode === pin ? freshResult : r))
        );
      }
    } catch (err: any) {
      alert(`Failed to refresh PIN ${pin}: ${err.message}`);
    } finally {
      setIsRefreshingPin(null);
    }
  };

  const hasSearched = targetPincodes.length > 0;
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <main className="min-h-screen flex flex-col py-8 px-4 md:px-8 max-w-5xl mx-auto">

      {/* Manifest-style masthead */}
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-3">
          <div className="flex items-baseline gap-2.5">
            <PackageSearch className="w-6 h-6 text-stamp shrink-0 translate-y-0.5" strokeWidth={2.25} />
            <h1 className="text-2xl font-bold tracking-tight">
              PIN Check
            </h1>
            <span className="hidden sm:inline text-[11px] font-mono uppercase tracking-widest text-ink-soft">
              Availability Manifest
            </span>
          </div>
          <span className="text-[11px] font-mono text-ink-soft">{today}</span>
        </div>
        <p className="mt-2 text-sm text-ink-soft max-w-2xl">
          Paste an Amazon.in or Flipkart product link, choose delivery hubs, and get a per-PIN availability readout.
        </p>
      </header>

      {/* Primary Dashboard Body */}
      <section className="flex-grow space-y-6">

        <div className="bg-paper-raised p-5 md:p-6 rounded-sm border border-line shadow-sm">
          <SearchBar onSearch={handleSearch} isLoading={isLoading} />
        </div>

        {hasSearched && !isLoading && results.length > 0 && (
          <div className="bg-paper-raised p-4 rounded-sm border border-line shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="space-y-1 min-w-0">
              <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-stamp-soft text-stamp border border-stamp/30 font-mono">
                {platform}
              </span>
              <h2 className="text-base font-bold text-ink line-clamp-1">{productTitle}</h2>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-stamp hover:underline break-all"
              >
                View original product link &rarr;
              </a>
            </div>

            <ExportBtn results={results} productId={results[0]?.productId || 'export'} />
          </div>
        )}

        {!hasSearched ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-paper-raised border border-dashed border-line rounded-sm space-y-3">
            <PackageSearch className="w-10 h-10 text-ink-soft/50" strokeWidth={1.5} />
            <p className="text-sm text-ink-soft font-medium text-center max-w-xs">
              No manifest yet — paste a product URL above to check availability across regions.
            </p>
          </div>
        ) : (
          <div className="bg-paper-raised p-5 md:p-6 rounded-sm border border-line shadow-sm">
            <StatusGrid
              results={results}
              isLoading={isLoading}
              targetPincodes={targetPincodes}
              onRefreshPin={handleRefreshPin}
              isRefreshingPin={isRefreshingPin}
            />
          </div>
        )}

      </section>

      <footer className="mt-10 pt-5 border-t border-line text-[11px] text-ink-soft space-y-4">
        <div className="bg-pending-bg p-3 rounded-sm border border-pending-line flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-pending shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-ink uppercase tracking-wider text-[10px]">Usage policy</span>
            <p className="leading-relaxed">
              Intended for manual regional availability checks only. Automated scraping, bulk scripts, and
              competitor monitoring are restricted under target-platform terms. Requests are capped at 3 per
              hour per IP, and results are cached for 6 hours to limit load on source sites.
            </p>
          </div>
        </div>
        <div className="text-center font-mono">
          PIN Check &middot; unofficial availability lookup, not affiliated with Amazon or Flipkart
        </div>
      </footer>

    </main>
  );
}
