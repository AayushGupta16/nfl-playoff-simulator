/**
 * Debug Script: Verify ESPN Standings Data
 * 
 * Run with: node scripts/debug_standings.cjs
 * 
 * This script fetches and displays NFL standings to verify our parsing is correct.
 */

const axios = require('axios');

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

async function main() {
    console.log('=== ESPN STANDINGS DEBUG ===\n');
    
    const res = await axios.get('https://site.api.espn.com/apis/v2/sports/football/nfl/standings');
    
    const teams = [];
    
    const processEntry = (entry) => {
        const teamData = entry.team;
        const stats = entry.stats;
        
        const getStat = (name) => stats.find(s => s.name === name)?.value || 0;
        
        const parseRecord = (recStr) => {
            if (!recStr) return { w: 0, l: 0, t: 0 };
            const parts = recStr.split('-');
            return { w: parseInt(parts[0]) || 0, l: parseInt(parts[1]) || 0, t: parseInt(parts[2]) || 0 };
        };
        
        const confStat = stats.find(s => s.displayName === 'CONF');
        const confRec = confStat ? parseRecord(confStat.displayValue) : { w: 0, l: 0, t: 0 };
        
        const abbr = teamData.abbreviation;
        const mapping = TEAM_DIVISION_MAP[abbr];
        
        teams.push({
            name: teamData.displayName,
            abbr,
            wins: getStat('wins'),
            losses: getStat('losses'),
            ties: getStat('ties'),
            divWins: getStat('divisionWins'),
            divLosses: getStat('divisionLosses'),
            confWins: confRec.w,
            confLosses: confRec.l,
            conference: mapping?.conference || 'Unknown',
            division: mapping?.division || 'Unknown'
        });
    };
    
    const traverse = (node) => {
        if (node.standings?.entries) node.standings.entries.forEach(processEntry);
        if (node.children) node.children.forEach(traverse);
    };
    
    traverse(res.data);
    
    console.log(`Loaded ${teams.length} teams\n`);
    
    // Group by division
    const divisions = {};
    teams.forEach(t => {
        const key = `${t.conference} ${t.division}`;
        if (!divisions[key]) divisions[key] = [];
        divisions[key].push(t);
    });
    
    // Display each division
    Object.keys(divisions).sort().forEach(div => {
        console.log(`\n${div}:`);
        console.log('-'.repeat(60));
        
        divisions[div]
            .sort((a, b) => b.wins - a.wins)
            .forEach(t => {
                console.log(
                    `${t.name.padEnd(22)} ${t.wins}-${t.losses}-${t.ties}`.padEnd(32) +
                    `Div: ${t.divWins}-${t.divLosses}`.padEnd(12) +
                    `Conf: ${t.confWins}-${t.confLosses}`
                );
            });
    });
    
    // Verify no teams have 0-0 division records (that would indicate parsing bug)
    const badTeams = teams.filter(t => t.divWins === 0 && t.divLosses === 0 && t.wins > 0);
    if (badTeams.length > 0) {
        console.log('\n⚠️ WARNING: Teams with 0-0 division record (likely parsing bug):');
        badTeams.forEach(t => console.log(`  ${t.name}`));
    } else {
        console.log('\n✅ All division records parsed correctly');
    }
}

main().catch(console.error);

