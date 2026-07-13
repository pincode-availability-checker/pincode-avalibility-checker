'use client';

import React, { useState } from 'react';
import { PackageOpen, ShieldAlert, ShoppingBag, RefreshCw } from 'lucide-react';
import SearchBar from './components/SearchBar.tsx';
import StatusGrid from './components/StatusGrid.tsx';
import ExportBtn from './components/ExportBtn.tsx';
import { fetchAvailability, ScrapedResult } from '../services/apiClient.ts';

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
      // Keep track of requested PINs to render the error states correctly on card levels if appropriate
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
        
        // Update the specific PIN result in the array
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

  return (
    <main className="min-h-screen flex flex-col justify-between py-6 px-4 md:px-8 max-w-6xl mx-auto space-y-6">
      
      {/* App Header */}
      <header className="space-y-1.5 text-center md:text-left border-b border-slate-200 pb-4">
        <div className="flex items-center justify-center md:justify-start gap-2 text-blue-600">
          <ShoppingBag className="w-6 h-6 stroke-[2.5]" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
            Regional Product Availability Tracker
          </h1>
        </div>
        <p className="text-xs text-slate-500 font-medium">
          Indian E-Commerce regional stock & logistics hub availability check dashboard.
        </p>
      </header>

      {/* Primary Dashboard Body */}
      <section className="flex-grow space-y-6">
        
        {/* Prominent Search Section */}
        <div className="bg-white p-5 rounded-md border border-slate-200 shadow-sm space-y-4">
          <SearchBar onSearch={handleSearch} isLoading={isLoading} />
        </div>

        {/* Results Metadata Header */}
        {hasSearched && !isLoading && results.length > 0 && (
          <div className="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="space-y-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 font-mono">
                {platform}
              </span>
              <h2 className="text-base font-bold text-slate-900 line-clamp-1">{productTitle}</h2>
              <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline break-all"
              >
                View original product link &rarr;
              </a>
            </div>
            
            <ExportBtn results={results} productId={results[0]?.productId || 'export'} />
          </div>
        )}

        {/* Dynamic Display (Empty State / Error / Grid) */}
        {!hasSearched ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-white border border-slate-200 rounded-md shadow-sm space-y-3">
            <PackageOpen className="w-12 h-12 text-slate-300 stroke-[1.5]" />
            <p className="text-sm text-slate-400 font-medium text-center">
              Paste a product URL to check availability across regions.
            </p>
          </div>
        ) : (
          /* Status Grid (Handles loading skeletons and interactive cards) */
          <div className="bg-white p-5 rounded-md border border-slate-200 shadow-sm">
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

      {/* Stated Usage Policy & Footer */}
      <footer className="space-y-4 pt-6 border-t border-slate-200 text-[11px] text-slate-400">
        <div className="bg-amber-50/50 p-3 rounded border border-amber-200/50 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600/70 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Usage Policy:</span>
            <p className="leading-relaxed">
              This system is intended for manual regional availability validation. Under our fair-use guidelines and target platform terms, automated scraping, bulk scripts, and competitor monitoring auditing are strictly regulated. Requests are capped at 3 transactions per hour per IP. Stale caching (6h) is active to protect server footprints.
            </p>
          </div>
        </div>
        <div className="text-center">
          &copy; 2026 Regional Product Availability Tracker. Designed under Utilitarian Minimal Guidelines.
        </div>
      </footer>

    </main>
  );
}
