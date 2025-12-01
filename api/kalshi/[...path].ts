import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function to proxy Kalshi API requests
 * This avoids CORS issues when calling Kalshi from the browser
 * 
 * Route: /api/kalshi/* -> https://api.elections.kalshi.com/*
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get the path after /api/kalshi/
  const { path } = req.query;
  const kalshiPath = Array.isArray(path) ? path.join('/') : path || '';
  
  // Build the target URL
  const targetUrl = `https://api.elections.kalshi.com/${kalshiPath}`;
  
  // Forward query parameters (except 'path' which is our catch-all)
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path') {
      queryParams.append(key, Array.isArray(value) ? value[0] : value || '');
    }
  }
  const queryString = queryParams.toString();
  const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;
  
  try {
    const response = await fetch(fullUrl, {
      method: req.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Kalshi proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from Kalshi API' });
  }
}

