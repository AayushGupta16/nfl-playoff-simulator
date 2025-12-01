const axios = require('axios');

async function check() {
    // Check scoreboard for current week
    const scoreboard = await axios.get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    console.log('Current Week:', scoreboard.data.week.number);
    console.log('Season:', scoreboard.data.season.year);
    
    // Try a different standings endpoint
    const standings2 = await axios.get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/standings');
    console.log('\nStandings v2 structure:', Object.keys(standings2.data));
    
    // Check teams endpoint
    const teams = await axios.get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams');
    
    // Find Lions
    const lions = teams.data.sports[0].leagues[0].teams.find(t => t.team.abbreviation === 'DET');
    console.log('\nLions from teams endpoint:', lions?.team?.record?.items?.[0]?.summary);
    
    // Find Vikings
    const vikings = teams.data.sports[0].leagues[0].teams.find(t => t.team.abbreviation === 'MIN');
    console.log('Vikings from teams endpoint:', vikings?.team?.record?.items?.[0]?.summary);
    
    // Find Bears
    const bears = teams.data.sports[0].leagues[0].teams.find(t => t.team.abbreviation === 'CHI');
    console.log('Bears from teams endpoint:', bears?.team?.record?.items?.[0]?.summary);
}

check().catch(console.error);
