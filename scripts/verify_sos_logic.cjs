/**
 * Script to verify Strength of Schedule (SOS) and Strength of Victory (SOV) calculations.
 * 
 * Methodology:
 * 1. Creates a mock scenario with known teams and game results.
 * 2. Calculates SOS/SOV manually.
 * 3. Runs the logic used in the app.
 * 4. Compares the results.
 */

const assert = require('assert');

console.log('=== VERIFYING SOS/SOV LOGIC ===\n');

// --- MOCK DATA ---

const teams = ['A', 'B', 'C', 'D', 'E'];

// Mock final records for opponents
// C: 10-0 (1.000)
// D: 5-5  (0.500)
// E: 0-10 (0.000)
const statsMap = new Map([
    ['A', { wins: 2, losses: 0, ties: 0, sos: 0, sov: 0 }],
    ['B', { wins: 1, losses: 1, ties: 0, sos: 0, sov: 0 }],
    ['C', { wins: 10, losses: 0, ties: 0, sos: 0, sov: 0 }],
    ['D', { wins: 5, losses: 5, ties: 0, sos: 0, sov: 0 }],
    ['E', { wins: 0, losses: 10, ties: 0, sos: 0, sov: 0 }]
]);

// Schedule:
// A played C and D. (Opponent wins: 10 + 5 = 15. Opponent games: 10 + 10 = 20. SOS = 0.75)
// A beat C and D. (SOV = 0.75)
// B played D and E. (Opponent wins: 5 + 0 = 5. Opponent games: 10 + 10 = 20. SOS = 0.25)
// B beat E, lost to D. (SOV = E's record = 0/10 = 0.00)

const allGames = [
    { id: 'g1', homeTeamId: 'A', awayTeamId: 'C' },
    { id: 'g2', homeTeamId: 'A', awayTeamId: 'D' },
    { id: 'g3', homeTeamId: 'B', awayTeamId: 'D' },
    { id: 'g4', homeTeamId: 'B', awayTeamId: 'E' }
];

const gameResults = new Map([
    ['g1', 'A'], // A beat C
    ['g2', 'A'], // A beat D
    ['g3', 'D'], // D beat B
    ['g4', 'B']  // B beat E
]);

// Build Schedule Map (logic from monteCarlo.ts)
const scheduleMap = new Map();
teams.forEach(t => scheduleMap.set(t, []));
allGames.forEach(g => {
    scheduleMap.get(g.homeTeamId).push(g.awayTeamId);
    scheduleMap.get(g.awayTeamId).push(g.homeTeamId);
});

// --- SIMULATION LOGIC (COPIED FROM monteCarlo.ts) ---

// First, cache current simulated win/loss/ties for fast lookup
const teamRecords = new Map();
statsMap.forEach((stats, tid) => {
    const w = stats.wins + 0.5 * stats.ties;
    const total = stats.wins + stats.losses + stats.ties;
    teamRecords.set(tid, { w, total });
});

statsMap.forEach((stats, tid) => {
    const opponents = scheduleMap.get(tid) || [];
    
    // Calculate SOS: Combined record of ALL opponents
    let sosWins = 0;
    let sosTotal = 0;

    opponents.forEach(oppId => {
        const rec = teamRecords.get(oppId);
        if (rec) {
            sosWins += rec.w;
            sosTotal += rec.total;
        }
    });
    
    stats.sos = sosTotal > 0 ? sosWins / sosTotal : 0;

    // Calculate SOV: Combined record of DEFEATED opponents
    let sovWins = 0;
    let sovTotal = 0;
    let victories = 0; 
    
    allGames.forEach(g => {
        const isHome = g.homeTeamId === tid;
        const isAway = g.awayTeamId === tid;
        if (!isHome && !isAway) return;
        
        const winner = gameResults.get(g.id);
        if (winner === tid) {
            const oppId = isHome ? g.awayTeamId : g.homeTeamId;
            const rec = teamRecords.get(oppId);
            if (rec) {
                sovWins += rec.w;
                sovTotal += rec.total;
            }
            victories++;
        }
    });

    stats.sov = sovTotal > 0 ? sovWins / sovTotal : 0;
});

// --- VERIFICATION ---

console.log('Results:');
console.log('Team A SOS:', statsMap.get('A').sos.toFixed(3), '(Expected: 0.750)');
console.log('Team A SOV:', statsMap.get('A').sov.toFixed(3), '(Expected: 0.750)');
console.log('Team B SOS:', statsMap.get('B').sos.toFixed(3), '(Expected: 0.250)');
console.log('Team B SOV:', statsMap.get('B').sov.toFixed(3), '(Expected: 0.000)');

// Assertions
const isClose = (a, b) => Math.abs(a - b) < 0.001;

if (isClose(statsMap.get('A').sos, 0.75) && 
    isClose(statsMap.get('A').sov, 0.75) &&
    isClose(statsMap.get('B').sos, 0.25) &&
    isClose(statsMap.get('B').sov, 0.00)) {
    console.log('\n✅ LOGIC VERIFIED: Calculations match NFL rules (Combined Opponent Record)');
} else {
    console.log('\n❌ LOGIC FAILED: Calculations do not match expected values');
    process.exit(1);
}

