/**
 * Kalshi Service - Fetches NFL game odds from Kalshi prediction markets
 * 
 * Kalshi is a regulated prediction market where users trade on event outcomes.
 * We use the KXNFLGAME series which provides moneyline (win/lose) markets.
 * 
 * API Documentation: https://docs.kalshi.com/api-reference
 * 
 * Key Concepts:
 * - Series: A category of markets (e.g., KXNFLGAME for NFL game winners)
 * - Event: A specific game (e.g., KXNFLGAME-25DEC07LAARI for Rams @ Cardinals)
 * - Market: A tradeable contract (e.g., "Rams win" or "Cardinals win")
 * - last_price: Most recent trade price (0-100, represents probability %)
 * 
 * CORS Note: We use a Vite proxy (/api/kalshi -> api.elections.kalshi.com)
 * to avoid browser CORS restrictions. See vite.config.ts.
 */

import axios from 'axios';
import type { Game } from '../types';

// In production, we use a serverless function that takes path as a query param
const IS_PROD = typeof window !== 'undefined' && !window.location.hostname.includes('localhost');

// Helper to build URL for Kalshi API calls
const buildKalshiUrl = (endpoint: string, params?: Record<string, string | number>): string => {
    if (IS_PROD) {
        const url = new URL('/api/kalshi', window.location.origin);
        url.searchParams.set('path', `trade-api/v2/${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.set(key, String(value));
            });
        }
        return url.toString();
    } else {
        const url = new URL(`/api/kalshi/trade-api/v2/${endpoint}`, window.location.origin);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.set(key, String(value));
            });
        }
        return url.toString();
    }
};

type KalshiMarket = any;

const fetchAllOpenMarkets = async (
    seriesTicker: string,
): Promise<KalshiMarket[]> => {
    let allMarkets: KalshiMarket[] = [];
    let cursor: string | undefined = undefined;
    let pageCount = 0;
    const MAX_PAGES = 10;

    do {
        const params: Record<string, string | number> = {
            limit: 200,
            status: 'open',
            series_ticker: seriesTicker
        };
        if (cursor) params.cursor = cursor;

        const response = await axios.get(buildKalshiUrl('markets', params));
        const data = response.data;

        if (data.markets) {
            allMarkets = allMarkets.concat(data.markets);
        }

        cursor = data.cursor;
        pageCount++;
    } while (cursor && pageCount < MAX_PAGES);

    return allMarkets;
};

// Map full team names to Kalshi abbreviations
const NAME_TO_ABBR: Record<string, string> = {
    "Buffalo Bills": "BUF", "Miami Dolphins": "MIA", "New England Patriots": "NE", "New York Jets": "NYJ",
    "Baltimore Ravens": "BAL", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Pittsburgh Steelers": "PIT",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAC", "Tennessee Titans": "TEN",
    "Denver Broncos": "DEN", "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Dallas Cowboys": "DAL", "New York Giants": "NYG", "Philadelphia Eagles": "PHI", "Washington Commanders": "WAS",
    "Chicago Bears": "CHI", "Detroit Lions": "DET", "Green Bay Packers": "GB", "Minnesota Vikings": "MIN",
    "Atlanta Falcons": "ATL", "Carolina Panthers": "CAR", "New Orleans Saints": "NO", "Tampa Bay Buccaneers": "TB",
    "Arizona Cardinals": "ARI", "Los Angeles Rams": "LA", "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA"
};

const ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
    Object.entries(NAME_TO_ABBR).map(([name, abbr]) => [abbr, name])
);

const MONTH_MAP: Record<number, string> = {
    0: 'JAN', 1: 'FEB', 2: 'MAR', 3: 'APR', 4: 'MAY', 5: 'JUN',
    6: 'JUL', 7: 'AUG', 8: 'SEP', 9: 'OCT', 10: 'NOV', 11: 'DEC'
};

/**
 * Convert ESPN date to Kalshi date format (e.g., "25DEC07")
 */
const getKalshiDateStr = (dateStr: string): string => {
    const d = new Date(dateStr);
    // Shift for US timezone (games are in US time)
    const usDate = new Date(d.getTime() - 5 * 60 * 60 * 1000);
    
    const year = usDate.getFullYear().toString().slice(2);
    const month = MONTH_MAP[usDate.getMonth()];
    const day = usDate.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
};

/**
 * Fetch NFL game winner odds from Kalshi's KXNFLGAME series
 * This provides moneyline-style win probabilities with tight spreads
 */
export const fetchKalshiOdds = async (games: Game[]): Promise<Map<string, number>> => {
    const oddsMap = new Map<string, number>();
    
    try {
        console.log("Fetching Kalshi KXNFLGAME (moneyline) markets...");

        const allMarkets = await fetchAllOpenMarkets('KXNFLGAME');
        
        console.log(`Loaded ${allMarkets.length} moneyline markets from Kalshi`);
        
        // Group markets by event (each event = one game, with 2 markets: home win / away win)
        const marketsByEvent = new Map<string, any[]>();
        allMarkets.forEach((m: any) => {
            const evt = m.event_ticker;
            if (!marketsByEvent.has(evt)) marketsByEvent.set(evt, []);
            marketsByEvent.get(evt)!.push(m);
        });
        
        console.log(`Found ${marketsByEvent.size} unique game events`);
        
        // Match ESPN games to Kalshi events
        games.forEach(game => {
            if (game.isFinished) return;
            
            const dateStr = getKalshiDateStr(game.date);
            const homeAbbr = NAME_TO_ABBR[game.homeTeamName] || game.homeTeamName.substring(0, 3).toUpperCase();
            const awayAbbr = NAME_TO_ABBR[game.awayTeamName] || game.awayTeamName.substring(0, 3).toUpperCase();
            
            // Kalshi format: KXNFLGAME-25DEC07AWYHOME (away @ home)
            const eventTicker = `KXNFLGAME-${dateStr}${awayAbbr}${homeAbbr}`;
            
            const eventMarkets = marketsByEvent.get(eventTicker);
            
            if (eventMarkets && eventMarkets.length >= 2) {
                // Find the home team's market
                const homeMarket = eventMarkets.find((m: any) => 
                    m.ticker.endsWith(`-${homeAbbr}`)
                );
                
                if (homeMarket && homeMarket.last_price > 0) {
                    // Use last traded price - this is an actual executed transaction
                    const prob = Math.max(0.05, Math.min(0.95, homeMarket.last_price / 100));
                    oddsMap.set(game.id, prob);
                }
            }
        });
        
        console.log(`Mapped Kalshi odds for ${oddsMap.size} games`);
        
    } catch (error) {
        console.warn("Failed to fetch Kalshi odds:", error);
    }
    
    return oddsMap;
};

export const fetchKalshiPlayoffOdds = async (): Promise<Map<string, number>> => {
    const playoffOdds = new Map<string, number>();

    try {
        const markets = await fetchAllOpenMarkets('KXNFLPLAYOFF');

        markets.forEach((m: any) => {
            // Ticker format: KXNFLPLAYOFF-26-KC
            const parts = m.ticker.split('-'); 
            if (parts.length < 3) return;
            const abbr = parts[parts.length - 1];
            const teamName = ABBR_TO_NAME[abbr];
            if (!teamName) return;
            
            if (m.last_price > 0) {
                // last_price is 0-100
                playoffOdds.set(teamName, m.last_price / 100);
            }
        });
        
        console.log(`Loaded Kalshi playoff odds for ${playoffOdds.size} teams`);
    } catch (err) {
        console.warn('Failed to fetch Kalshi playoff odds:', err);
    }

    return playoffOdds;
};
