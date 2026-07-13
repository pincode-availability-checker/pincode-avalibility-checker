const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export interface ScrapedResult {
  productId: string;
  productTitle: string;
  pincode: string;
  status: 'Available' | 'Unavailable' | "Couldn't verify";
  deliveryDate: string | null;
  scrapedAt: string;
  source: 'cache' | 'live';
  error?: string;
}

export interface AvailabilityResponse {
  productId: string;
  platform: string;
  productTitle: string;
  url: string;
  summary: {
    totalChecked: number;
    available: number;
    unavailable: number;
    failed: number;
  };
  results: ScrapedResult[];
  errorWarning?: string;
  error?: string;
}

export async function fetchAvailability(productUrl: string, pincodes: string[]): Promise<AvailabilityResponse> {
  const pinsParam = pincodes.join(',');
  const queryUrl = `${API_BASE_URL}/availability?url=${encodeURIComponent(productUrl)}&pins=${encodeURIComponent(pinsParam)}`;

  try {
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 429) {
      throw new Error('Too many queries from this IP. Anonymous requests are limited to 3 per hour.');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data as AvailabilityResponse;
  } catch (error: any) {
    console.error('API Client Error:', error);
    throw new Error(error.message || 'Failed to connect to the backend server.');
  }
}
