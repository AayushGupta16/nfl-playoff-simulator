const axios = require('axios');

async function main() {
    console.log('Fetching KXNFLPLAYOFF markets...');
    try {
        const res = await axios.get('https://api.elections.kalshi.com/trade-api/v2/markets', {
            params: {
                series_ticker: 'KXNFLPLAYOFF',
                status: 'open',
                limit: 100
            }
        });

        const markets = res.data.markets || [];
        
        // Sort by Yes price descending
        markets.sort((a, b) => b.yes_ask - a.yes_ask);

        markets.forEach(m => {
             // Extract team name from ticker if possible, or title
             // Title format: "Will the Buffalo Bills make the playoffs?"
             let team = m.title.replace('Will the ', '').replace(' make the playoffs?', '');
             
             console.log(`${team}`);
             console.log(`Yes ${m.yes_ask}¢`);
             console.log(`No ${m.no_ask}¢`);
             console.log('');
        });
        
    } catch (e) {
        console.error(e);
    }
}

main();

