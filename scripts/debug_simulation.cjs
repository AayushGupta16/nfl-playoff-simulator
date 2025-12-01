/**
 * Debug Script: Run Standalone Simulation
 * 
 * Run with: node scripts/debug_simulation.cjs
 * 
 * This script runs the full Monte Carlo simulation outside of the browser
 * to verify the logic is working correctly.
 */

const axios = require('axios');

// Team division mapping
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

// Elo constants
const BASE_ELO = 1500;
const ELO_RANGE = 300;
const HFA = 65;

// Calculate dynamic win probability
const calcWinProb = (homeStats, awayStats) => {
    const getWinPct = (s) => {
        const total = s.wins + s.losses + s.ties;
        return total > 0 ? (s.wins + 0.5 * s.ties) / total : 0.5;
    };
    const homeElo = BASE_ELO + ((getWinPct(homeStats) - 0.5) * 2 * ELO_RANGE);
    const awayElo = BASE_ELO + ((getWinPct(awayStats) - 0.5) * 2 * ELO_RANGE);
    return Math.max(0.01, Math.min(0.99, 1 / (1 + Math.pow(10, -(homeElo - awayElo + HFA) / 400))));
};

const getPct = (s) => (s.wins + 0.5 * s.ties) / (s.wins + s.losses + s.ties || 1);

async function main() {
    console.log('=== MONTE CARLO SIMULATION DEBUG ===\n');
    
    // 1. Fetch standings
    console.log('Fetching standings...');
    const standingsRes = await axios.get('https://site.api.espn.com/apis/v2/sports/football/nfl/standings');
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
            id: teamData.id,
            name: teamData.displayName,
            abbr,
            wins: getStat('wins'),
            losses: getStat('losses'),
            ties: getStat('ties') || 0,
            divisionWins: getStat('divisionWins'),
            divisionLosses: getStat('divisionLosses'),
            conferenceWins: confRec.w,
            conferenceLosses: confRec.l,
            conference: mapping?.conference || 'Unknown',
            division: mapping?.division || 'Unknown'
        });
    };
    
    const traverse = (node) => {
        if (node.standings?.entries) node.standings.entries.forEach(processEntry);
        if (node.children) node.children.forEach(traverse);
    };
    traverse(standingsRes.data);
    console.log(`  Loaded ${teams.length} teams`);
    
    // 2. Fetch schedule
    console.log('Fetching schedule...');
    const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
    const allGames = [];
    
    for (let w = 1; w <= 18; w++) {
        const res = await axios.get(`${BASE_URL}/scoreboard?week=${w}`);
        (res.data.events || []).forEach(evt => {
            const comp = evt.competitions[0];
            const home = comp.competitors.find(c => c.homeAway === 'home');
            const away = comp.competitors.find(c => c.homeAway === 'away');
            
            allGames.push({
                week: w,
                homeTeamId: home.team.id,
                awayTeamId: away.team.id,
                isFinished: evt.status.type.completed,
                winnerId: evt.status.type.completed ? (home.winner ? home.team.id : away.team.id) : null
            });
        });
    }
    
    const finished = allGames.filter(g => g.isFinished).length;
    const remaining = allGames.filter(g => !g.isFinished).length;
    console.log(`  Loaded ${allGames.length} games (${finished} finished, ${remaining} remaining)`);
    
    // 3. Run simulation
    const NUM_SIMS = 10000;
    console.log(`\nRunning ${NUM_SIMS.toLocaleString()} simulations...`);
    
    const results = new Map();
    const divWinnerCounts = new Map();
    teams.forEach(t => {
        results.set(t.id, { madePlayoffs: 0, name: t.name });
        divWinnerCounts.set(t.id, 0);
    });
    
    const startTime = Date.now();
    
    // Group remaining games by week
    const remainingByWeek = new Map();
    allGames.filter(g => !g.isFinished).forEach(g => {
        if (!remainingByWeek.has(g.week)) remainingByWeek.set(g.week, []);
        remainingByWeek.get(g.week).push(g);
    });
    const sortedWeeks = [...remainingByWeek.keys()].sort((a, b) => a - b);
    
    for (let sim = 0; sim < NUM_SIMS; sim++) {
        // Initialize stats
        const statsMap = new Map();
        teams.forEach(t => {
            statsMap.set(t.id, {
                wins: t.wins, losses: t.losses, ties: t.ties,
                divWins: t.divisionWins, divLosses: t.divisionLosses,
                confWins: t.conferenceWins, confLosses: t.conferenceLosses
            });
        });
        
        // Simulate week by week
        for (const week of sortedWeeks) {
            for (const game of remainingByWeek.get(week)) {
                const homeStats = statsMap.get(game.homeTeamId);
                const awayStats = statsMap.get(game.awayTeamId);
                const home = teams.find(t => t.id === game.homeTeamId);
                const away = teams.find(t => t.id === game.awayTeamId);
                
                if (!homeStats || !awayStats || !home || !away) continue;
                
                const prob = calcWinProb(homeStats, awayStats);
                const homeWins = Math.random() < prob;
                
                if (homeWins) {
                    homeStats.wins++; awayStats.losses++;
                    if (home.conference === away.conference) {
                        homeStats.confWins++; awayStats.confLosses++;
                        if (home.division === away.division) {
                            homeStats.divWins++; awayStats.divLosses++;
                        }
                    }
                } else {
                    awayStats.wins++; homeStats.losses++;
                    if (home.conference === away.conference) {
                        awayStats.confWins++; homeStats.confLosses++;
                        if (home.division === away.division) {
                            awayStats.divWins++; homeStats.divLosses++;
                        }
                    }
                }
            }
        }
        
        // Determine playoffs
        const processConference = (confTeams) => {
            const divisionWinners = [];
            const wildcardPool = [];
            
            ['North', 'South', 'East', 'West'].forEach(div => {
                const divTeams = confTeams.filter(t => t.division === div);
                divTeams.sort((a, b) => getPct(statsMap.get(b.id)) - getPct(statsMap.get(a.id)));
                
                if (divTeams.length > 0) {
                    divisionWinners.push(divTeams[0]);
                    divWinnerCounts.set(divTeams[0].id, divWinnerCounts.get(divTeams[0].id) + 1);
                    for (let k = 1; k < divTeams.length; k++) wildcardPool.push(divTeams[k]);
                }
            });
            
            wildcardPool.sort((a, b) => getPct(statsMap.get(b.id)) - getPct(statsMap.get(a.id)));
            return [...divisionWinners, ...wildcardPool.slice(0, 3)];
        };
        
        const afcPlayoffs = processConference(teams.filter(t => t.conference === 'AFC'));
        const nfcPlayoffs = processConference(teams.filter(t => t.conference === 'NFC'));
        
        [...afcPlayoffs, ...nfcPlayoffs].forEach(t => {
            results.get(t.id).madePlayoffs++;
        });
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  Completed in ${elapsed}s\n`);
    
    // 4. Display results
    console.log('='.repeat(70));
    console.log('\nPLAYOFF PROBABILITIES:\n');
    
    ['AFC', 'NFC'].forEach(conf => {
        console.log(`${conf}:`);
        console.log('-'.repeat(60));
        
        const confTeams = teams
            .filter(t => t.conference === conf)
            .map(t => ({
                ...t,
                playoffProb: results.get(t.id).madePlayoffs / NUM_SIMS,
                divWinProb: divWinnerCounts.get(t.id) / NUM_SIMS
            }))
            .sort((a, b) => b.playoffProb - a.playoffProb);
        
        confTeams.forEach((t, i) => {
            const rank = (i + 1).toString().padStart(2);
            const name = t.name.padEnd(22);
            const record = `${t.wins}-${t.losses}`.padEnd(6);
            const playoff = `${(t.playoffProb * 100).toFixed(1)}%`.padStart(6);
            const divWin = `${(t.divWinProb * 100).toFixed(1)}%`.padStart(6);
            
            console.log(`  ${rank}. ${name} ${record} Playoff: ${playoff}  Div Win: ${divWin}`);
        });
        
        console.log();
    });
    
    // 5. Sanity checks
    console.log('='.repeat(70));
    console.log('\nSANITY CHECKS:\n');
    
    // Check total playoff spots
    const totalPlayoffProb = [...results.values()].reduce((sum, r) => sum + r.madePlayoffs, 0) / NUM_SIMS;
    console.log(`Total playoff spots per sim: ${totalPlayoffProb.toFixed(1)} (should be 14)`);
    
    // Check division winners
    const totalDivWinners = [...divWinnerCounts.values()].reduce((sum, c) => sum + c, 0) / NUM_SIMS;
    console.log(`Total division winners per sim: ${totalDivWinners.toFixed(1)} (should be 8)`);
    
    // Check for impossible probabilities
    const over100 = [...results.values()].filter(r => r.madePlayoffs > NUM_SIMS);
    if (over100.length > 0) {
        console.log(`\n⚠️ ERROR: ${over100.length} teams have >100% probability!`);
    } else {
        console.log('\n✅ All probabilities are valid (0-100%)');
    }
}

main().catch(console.error);

