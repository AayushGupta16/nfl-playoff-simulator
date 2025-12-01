const axios = require('axios');

async function main() {
    console.log("Checking ESPN API for Matchup Predictor data...");
    
    // Fetch a future week (e.g., Week 16 or 17)
    const week = 13;
    const response = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}`);
    
    if (response.data.events && response.data.events.length > 0) {
        const evt = response.data.events[0];
        console.log(`\nExamining game: ${evt.name} (Week ${week})`);
        
        // Check competitions array
        const comp = evt.competitions[0];
        
        // Check for predictor/odds/analytics
        if (evt.predictor) console.log("Found 'predictor' on event:", JSON.stringify(evt.predictor, null, 2));
        if (comp.predictor) console.log("Found 'predictor' on competition:", JSON.stringify(comp.predictor, null, 2));
        
        // Sometimes it's in 'odds' but as a different provider?
        if (comp.odds) console.log("Found 'odds':", JSON.stringify(comp.odds, null, 2));
        
        // Check deeply for anything resembling a probability
        console.log("\nDeep keys in competition object:", Object.keys(comp));
        
        // Let's check if there's a separate 'analytics' endpoint or similar referenced in links
        if (evt.links) {
            console.log("\nLinks found:", evt.links.map(l => l.rel).flat());
        }
    } else {
        console.log("No events found for Week " + week);
    }
}

main().catch(console.error);
