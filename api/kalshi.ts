import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function to proxy Kalshi API requests
 * This avoids CORS issues when calling Kalshi from the browser
 * 
 * Route: /api/kalshi?path=trade-api/v2/markets&... -> https://api.elections.kalshi.com/trade-api/v2/markets?...
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Get the path from query parameter
  const kalshiPath = req.query.path as string || '';
  
  // Build query string from remaining params
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path') {
      const val = Array.isArray(value) ? value[0] : value;
      if (val) queryParams.append(key, val);
    }
  }
  
  const queryString = queryParams.toString();
  const fullUrl = `https://api.elections.kalshi.com/${kalshiPath}${queryString ? '?' + queryString : ''}`;
  
  console.log('Proxying to:', fullUrl);
  
  try {
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    const data = await response.json();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Edge caching: Kalshi market data changes, but short s-maxage helps "most users"
    // by letting Vercel serve hot responses at the edge while keeping data reasonably fresh.
    if (response.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Kalshi proxy error:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Failed to fetch from Kalshi API', details: String(error) });
  }
}

