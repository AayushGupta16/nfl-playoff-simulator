const axios = require('axios');

async function debug() {
    // Fetch standings
    const res = await axios.get('https://site.api.espn.com/apis/v2/sports/football/nfl/standings');
    
    const TEAM_DIVISION_MAP = {
        'BUF': { conference: 'AFC', division: 'East' },
        'MIA': { conference: 'AFC', division: 'East' },
        'NE': { conference: 'AFC', division: 'East' },
        'NYJ': { conference: 'AFC', division: 'East' },
        'BAL': { conference: 'AFC', division: 'North' },
        'CIN': { conference: 'AFC', division: 'North' },
        'CLE': { conference: 'AFC', division: 'North' },
        'PIT': { conference: 'AFC', division: 'North' },
        'HOU': { conference: 'AFC', division: 'South' },
        'IND': { conference: 'AFC', division: 'South' },
        'JAX': { conference: 'AFC', division: 'South' },
        'TEN': { conference: 'AFC', division: 'South' },
        'DEN': { conference: 'AFC', division: 'West' },
        'KC': { conference: 'AFC', division: 'West' },
        'LV': { conference: 'AFC', division: 'West' },
        'LAC': { conference: 'AFC', division: 'West' },
        'DAL': { conference: 'NFC', division: 'East' },
        'NYG': { conference: 'NFC', division: 'East' },
        'PHI': { conference: 'NFC', division: 'East' },
        'WSH': { conference: 'NFC', division: 'East' },
        'CHI': { conference: 'NFC', division: 'North' },
        'DET': { conference: 'NFC', division: 'North' },
        'GB': { conference: 'NFC', division: 'North' },
        'MIN': { conference: 'NFC', division: 'North' },
        'ATL': { conference: 'NFC', division: 'South' },
        'CAR': { conference: 'NFC', division: 'South' },
        'NO': { conference: 'NFC', division: 'South' },
        'TB': { conference: 'NFC', division: 'South' },
        'ARI': { conference: 'NFC', division: 'West' },
        'LAR': { conference: 'NFC', division: 'West' },
        'SF': { conference: 'NFC', division: 'West' },
        'SEA': { conference: 'NFC', division: 'West' }
    };

    const teams = [];
    
    const processEntry = (entry) => {
        const teamData = entry.team;
        const stats = entry.stats;
        
        const getStat = (name, type) => {
            return stats.find(s => s.name === name || s.type === type)?.value || 0;
        };

        const wins = getStat('wins', 'wins');
        const losses = getStat('losses', 'losses');
        const ties = getStat('ties', 'ties');
        
        const abbr = teamData.abbreviation;
        const mapping = TEAM_DIVISION_MAP[abbr];

        teams.push({
            id: teamData.id,
            name: teamData.displayName,
            abbreviation: abbr,
            wins,
            losses,
            ties,
            conference: mapping?.conference || 'Unknown',
            division: mapping?.division || 'Unknown',
        });
    };

    const traverse = (node) => {
        if (node.standings && node.standings.entries) {
            node.standings.entries.forEach(processEntry);
        }
        if (node.children) {
            node.children.forEach(traverse);
        }
    };

    traverse(res.data);
    
    // Find Lions
    const lions = teams.find(t => t.name.includes('Lions'));
    console.log('Lions:', lions);
    
    // Show NFC North
    const nfcNorth = teams.filter(t => t.conference === 'NFC' && t.division === 'North');
    console.log('\nNFC North:');
    nfcNorth.sort((a, b) => b.wins - a.wins).forEach(t => {
        console.log(`  ${t.name}: ${t.wins}-${t.losses}-${t.ties}`);
    });
    
    // Show all NFC teams sorted by wins
    const nfc = teams.filter(t => t.conference === 'NFC');
    console.log('\nAll NFC Teams by Wins:');
    nfc.sort((a, b) => b.wins - a.wins).forEach(t => {
        console.log(`  ${t.name} (${t.division}): ${t.wins}-${t.losses}-${t.ties}`);
    });
}

debug().catch(console.error);
