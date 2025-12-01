/**
 * Debug Script: Verify Kalshi Market Data
 * 
 * Run with: node scripts/debug_kalshi.cjs
 * 
 * This script fetches Kalshi NFL game markets and displays them for debugging.
 */

const axios = require('axios');

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

async function main() {
    console.log('=== KALSHI NFL MARKETS DEBUG ===\n');
    
    // 1. Fetch KXNFLGAME markets (moneyline)
    console.log('Fetching KXNFLGAME (moneyline) markets...\n');
    
    const res = await axios.get(`${BASE_URL}/markets`, {
        params: {
            series_ticker: 'KXNFLGAME',
            status: 'open',
            limit: 200
        }
    });
    
    const markets = res.data.markets || [];
    console.log(`Found ${markets.length} markets\n`);
    
    // 2. Group by event (each event = 1 game with 2 markets)
    const byEvent = new Map();
    markets.forEach(m => {
        if (!byEvent.has(m.event_ticker)) byEvent.set(m.event_ticker, []);
        byEvent.get(m.event_ticker).push(m);
    });
    
    console.log(`Unique games: ${byEvent.size}\n`);
    console.log('='.repeat(80));
    
    // 3. Display each game
    byEvent.forEach((gameMarkets, eventTicker) => {
        console.log(`\n${eventTicker}`);
        
        // Parse date and teams from ticker
        // Format: KXNFLGAME-25DEC07LAARI
        const parts = eventTicker.replace('KXNFLGAME-', '');
        const date = parts.slice(0, 7); // 25DEC07
        const teams = parts.slice(7);   // LAARI
        
        console.log(`  Date: ${date}`);
        
        gameMarkets.forEach(m => {
            const team = m.ticker.split('-').pop();
            const bidAsk = `${m.yes_bid}/${m.yes_ask}`;
            console.log(`  ${team.padEnd(5)} Last: ${m.last_price}%  Bid/Ask: ${bidAsk.padEnd(8)}  Title: ${m.title}`);
        });
    });
    
    // 4. Check for issues
    console.log('\n' + '='.repeat(80));
    console.log('\nDIAGNOSTICS:\n');
    
    // Check for wide spreads
    const wideSpreadMarkets = markets.filter(m => 
        m.yes_bid > 0 && m.yes_ask > 0 && (m.yes_ask - m.yes_bid) > 20
    );
    
    if (wideSpreadMarkets.length > 0) {
        console.log(`⚠️ ${wideSpreadMarkets.length} markets have wide bid/ask spreads (>20):`);
        wideSpreadMarkets.slice(0, 5).forEach(m => {
            console.log(`   ${m.ticker}: ${m.yes_bid}/${m.yes_ask} (spread: ${m.yes_ask - m.yes_bid})`);
        });
    } else {
        console.log('✅ All markets have reasonable bid/ask spreads');
    }
    
    // Check for missing last_price
    const noLastPrice = markets.filter(m => !m.last_price || m.last_price === 0);
    if (noLastPrice.length > 0) {
        console.log(`\n⚠️ ${noLastPrice.length} markets have no last_price (no trades yet)`);
    } else {
        console.log('✅ All markets have last_price');
    }
    
    // 5. Show available series for reference
    console.log('\n' + '='.repeat(80));
    console.log('\nOTHER NFL SERIES AVAILABLE:\n');
    
    const seriesRes = await axios.get(`${BASE_URL}/series`, { params: { limit: 200 } });
    const nflSeries = (seriesRes.data.series || []).filter(s => 
        s.ticker?.includes('NFL') && !s.ticker?.includes('NFLX')
    );
    
    nflSeries.slice(0, 20).forEach(s => {
        console.log(`  ${s.ticker.padEnd(30)} ${s.title}`);
    });
}

main().catch(console.error);

