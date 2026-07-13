import React from 'react';
import { Download } from 'lucide-react';
import { ScrapedResult } from '../../services/apiClient';
import { PRESET_HUBS } from './SearchBar';

interface ExportBtnProps {
  results: ScrapedResult[];
  productId: string;
}

export default function ExportBtn({ results, productId }: ExportBtnProps) {
  const getHubName = (pin: string) => {
    const hub = PRESET_HUBS.find(h => h.pins.includes(pin));
    return hub ? `${hub.name} (${pin})` : 'Custom Location';
  };

  const handleExport = () => {
    if (results.length === 0) return;

    const headers = ['Pincode', 'Location', 'Status', 'Delivery Date/Details', 'Source', 'Checked At'];

    const rows = results.map(result => [
      result.pincode,
      getHubName(result.pincode),
      result.status,
      result.deliveryDate || 'N/A',
      result.source,
      new Date(result.scrapedAt).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => {
        const cleanVal = String(val).replace(/"/g, '""');
        return `"${cleanVal}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.setAttribute('href', url);
    link.setAttribute('download', `availability_report_${productId || 'export'}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={results.length === 0}
      className="inline-flex items-center gap-2 bg-paper-raised text-ink border border-line rounded-sm px-4 py-2 font-medium hover:border-ink-soft shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-stamp/40 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download className="w-4 h-4 text-ink-soft" />
      Export CSV
    </button>
  );
}
