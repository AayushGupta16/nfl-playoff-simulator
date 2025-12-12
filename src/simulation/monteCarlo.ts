/**
 * Monte Carlo simulation for NFL playoff projections.
 *
 * Simulates the remaining season N times to estimate playoff probabilities.
 * Uses Kalshi prediction markets for both game odds and team strength (Elo).
 */

import type { Team, Game, SimulationResult } from '../types';
import { sortTeams, type TeamStatsMap, type SeasonStats } from './tieBreakers';
import { calculateWinProbability, updateEloAfterTie } from '../services/eloService';
import { computeScheduleStrength } from './scheduleStrength';

const K_FACTOR = 20;
const TIE_PROB = 0.003; // Approx 1 tie per season (1/272 ≈ 0.0037)

// --- HELPERS ---

export const eloDiffToWinProb = (diff: number): number => {
    return 1 / (1 + Math.pow(10, -diff / 400));
};

export const winProbToEloDiff = (prob: number): number => {
    const p = Math.max(0.01, Math.min(0.99, prob));
    return -400 * Math.log10(1 / p - 1);
};

// --- MAIN SIMULATION ---

/**
 * Run Monte Carlo simulation.
 * 
 * @param initialTeams - Current team standings
 * @param allGames - All games (completed and remaining)
 * @param numSimulations - Number of simulations to run
 * @param oddsMap - Kalshi game-level odds (gameId -> home win probability)
 * @param kalshiEloMap - Kalshi-derived Elo ratings (teamId -> Elo)
 * @param userPicks - User-selected game outcomes (gameId -> winnerId)
 */
export const runSimulation = (
    initialTeams: Team[],
    allGames: Game[],
    numSimulations: number,
    oddsMap: Map<string, number>,
    kalshiEloMap: Map<string, number>,
    userPicks: Map<string, string> = new Map()
): { teamResults: SimulationResult[], simulatedOdds: Map<string, number> } => {
    if (kalshiEloMap.size === 0) {
        throw new Error('Kalshi Elo map is required. Cannot run simulation without market data.');
    }
    
    // Validate all teams have Elo ratings
    for (const team of initialTeams) {
        if (!kalshiEloMap.has(team.id)) {
            throw new Error(`Missing Kalshi Elo for team: ${team.name} (${team.id})`);
        }
    }

    // Use typed arrays for result tracking (faster than Map for numeric counters)
    const teamIds = initialTeams.map(t => t.id);
    const teamIdToIdx = new Map<string, number>();
    teamIds.forEach((id, idx) => teamIdToIdx.set(id, idx));
    
    const numTeams = initialTeams.length;
    const madePlayoffs = new Uint32Array(numTeams);
    const wonDivision = new Uint32Array(numTeams);
    const madeWildcard = new Uint32Array(numTeams);
    const wonFirstSeed = new Uint32Array(numTeams);

    // Track home wins for simulated odds
    const remainingGames = allGames.filter(g => !g.isFinished);
    const gameIdToIdx = new Map<string, number>();
    remainingGames.forEach((g, idx) => gameIdToIdx.set(g.id, idx));
    const gameHomeWins = new Uint32Array(remainingGames.length);

    // Pre-build schedule lookups and initial wins
    const scheduleMap = new Map<string, string[]>();
    const teamGamesMap = new Map<string, Game[]>();
    const initialWinsAgainst = new Map<string, string[]>();

    initialTeams.forEach(t => {
        scheduleMap.set(t.id, []);
        teamGamesMap.set(t.id, []);
        initialWinsAgainst.set(t.id, []);
    });

    allGames.forEach(g => {
        scheduleMap.get(g.homeTeamId)?.push(g.awayTeamId);
        scheduleMap.get(g.awayTeamId)?.push(g.homeTeamId);
        teamGamesMap.get(g.homeTeamId)?.push(g);
        teamGamesMap.get(g.awayTeamId)?.push(g);

        if (g.isFinished && g.winnerId) {
            if (g.winnerId === g.homeTeamId) {
                initialWinsAgainst.get(g.homeTeamId)?.push(g.awayTeamId);
            } else if (g.winnerId === g.awayTeamId) {
                initialWinsAgainst.get(g.awayTeamId)?.push(g.homeTeamId);
            }
        }
    });

    // Track finished game results
    const finishedResults = new Map<string, string>();
    allGames.filter(g => g.isFinished && g.winnerId).forEach(g => {
        finishedResults.set(g.id, g.winnerId!);
    });

    // Group remaining games by week (flatten to single array for better cache locality)
    const remainingByWeek = new Map<number, Game[]>();
    remainingGames.forEach(g => {
        if (!remainingByWeek.has(g.week)) remainingByWeek.set(g.week, []);
        remainingByWeek.get(g.week)!.push(g);
    });
    const weeks = Array.from(remainingByWeek.keys()).sort((a, b) => a - b);

    // Pre-build team lookup for O(1) access in hot loop
    const teamById = new Map<string, Team>();
    initialTeams.forEach(t => teamById.set(t.id, t));

    // Pre-compute conference/division info for games to avoid repeated property access
    const gameInfo = remainingGames.map(g => {
        const home = teamById.get(g.homeTeamId)!;
        const away = teamById.get(g.awayTeamId)!;
        return {
            game: g,
            home,
            away,
            sameConf: home.conference === away.conference,
            sameDiv: home.division === away.division,
            hasMarketOdds: oddsMap.has(g.id),
            marketOdds: oddsMap.get(g.id) ?? 0,
            userPick: userPicks.get(g.id)
        };
    });
    
    // Group pre-computed game info by week
    const gameInfoByWeek = new Map<number, typeof gameInfo>();
    gameInfo.forEach(gi => {
        const week = gi.game.week;
        if (!gameInfoByWeek.has(week)) gameInfoByWeek.set(week, []);
        gameInfoByWeek.get(week)!.push(gi);
    });
    
    // Pre-split teams by conference (done once, not per-sim)
    const afcTeams = initialTeams.filter(t => t.conference === 'AFC');
    const nfcTeams = initialTeams.filter(t => t.conference === 'NFC');
    
    // Pre-split by division within each conference
    const afcByDiv = new Map<string, Team[]>();
    const nfcByDiv = new Map<string, Team[]>();
    const divisions = ['North', 'South', 'East', 'West'];
    divisions.forEach(div => {
        afcByDiv.set(div, afcTeams.filter(t => t.division === div));
        nfcByDiv.set(div, nfcTeams.filter(t => t.division === div));
    });
    
    // Pre-allocate base stats template
    const baseStatsTemplate: SeasonStats[] = initialTeams.map(t => ({
                wins: t.wins,
                losses: t.losses,
                ties: t.ties,
                divWins: t.divisionWins,
                divLosses: t.divisionLosses,
                divTies: t.divisionTies,
                confWins: t.conferenceWins,
                confLosses: t.conferenceLosses,
                confTies: t.conferenceTies,
        sov: 0,
        sos: 0,
        gamesPlayed: new Map()
    }));
    
    // Pre-allocate Elo array from Kalshi data
    const baseEloArray = new Float64Array(numTeams);
    initialTeams.forEach((t, idx) => {
        baseEloArray[idx] = kalshiEloMap.get(t.id)!;
    });

    // Run simulations
    for (let sim = 0; sim < numSimulations; sim++) {
        const statsMap: TeamStatsMap = new Map();
        const gameResults = new Map<string, string>(finishedResults);
        
        // Use typed array for Elo (copy from base)
        const simElo = new Float64Array(baseEloArray);
        
        // Clone initial wins for this simulation
        const simWinsAgainst = new Map<string, string[]>();
        initialWinsAgainst.forEach((opps, teamId) => {
            simWinsAgainst.set(teamId, [...opps]);
        });

        // Clone stats from template
        initialTeams.forEach((t, idx) => {
            const template = baseStatsTemplate[idx];
            statsMap.set(t.id, {
                wins: template.wins,
                losses: template.losses,
                ties: template.ties,
                divWins: template.divWins,
                divLosses: template.divLosses,
                divTies: template.divTies,
                confWins: template.confWins,
                confLosses: template.confLosses,
                confTies: template.confTies,
                sov: 0,
                sos: 0,
                gamesPlayed: new Map()
            });
        });

        // Simulate remaining games week by week
        for (const week of weeks) {
            const weekGameInfo = gameInfoByWeek.get(week)!;

            for (const gi of weekGameInfo) {
                const { game, home, away, sameConf, sameDiv, hasMarketOdds, marketOdds, userPick } = gi;
                const homeStats = statsMap.get(home.id)!;
                const awayStats = statsMap.get(away.id)!;
                const homeIdx = teamIdToIdx.get(home.id)!;
                const awayIdx = teamIdToIdx.get(away.id)!;
                const homeElo = simElo[homeIdx];
                const awayElo = simElo[awayIdx];

                let winnerId = userPick;
                let homeWins = false;
                let isTie = false;

                if (winnerId) {
                    if (winnerId === 'TIE') {
                        isTie = true;
                    } else {
                        homeWins = winnerId === home.id;
                    }
                } else {
                    // Use pre-computed market odds or standard Elo calc
                    const winProb = hasMarketOdds 
                        ? marketOdds 
                        : calculateWinProbability(homeElo, awayElo, true);
                    
                    const rand = Math.random();
                    if (rand < TIE_PROB) {
                        isTie = true;
                        winnerId = 'TIE';
                    } else {
                        // Rescale remaining probability to [0, 1]
                        const adjustedRand = (rand - TIE_PROB) / (1 - TIE_PROB);
                        homeWins = adjustedRand < winProb;
                        winnerId = homeWins ? home.id : away.id;
                    }
                }

                gameResults.set(game.id, winnerId);
                
                const gameIdx = gameIdToIdx.get(game.id);
                if (homeWins && gameIdx !== undefined) {
                    gameHomeWins[gameIdx]++;
                }

                // Update stats (inlined for speed)
                if (isTie) {
                    homeStats.ties++;
                    awayStats.ties++;
                    
                    if (sameConf) {
                        homeStats.confTies++;
                        awayStats.confTies++;
                        if (sameDiv) {
                            homeStats.divTies++;
                            awayStats.divTies++;
                        }
                    }

                    // Elo update
                    const { newTeam1Elo, newTeam2Elo } = updateEloAfterTie(homeElo, awayElo, true);
                    simElo[homeIdx] = newTeam1Elo;
                    simElo[awayIdx] = newTeam2Elo;
                } else if (homeWins) {
                    homeStats.wins++;
                    awayStats.losses++;
                    simWinsAgainst.get(home.id)!.push(away.id);
                    
                    if (sameConf) {
                        homeStats.confWins++;
                        awayStats.confLosses++;
                        if (sameDiv) {
                            homeStats.divWins++;
                            awayStats.divLosses++;
                        }
                    }
                    
                    // Elo update
                    const winnerExpected = calculateWinProbability(homeElo, awayElo, true);
                    const eloChange = K_FACTOR * (1 - winnerExpected);
                    simElo[homeIdx] = homeElo + eloChange;
                    simElo[awayIdx] = awayElo - eloChange;
                } else {
                    awayStats.wins++;
                    homeStats.losses++;
                    simWinsAgainst.get(away.id)!.push(home.id);

                    if (sameConf) {
                        awayStats.confWins++;
                        homeStats.confLosses++;
                        if (sameDiv) {
                            awayStats.divWins++;
                            homeStats.divLosses++;
                        }
                    }
                    
                    // Elo update (away team won)
                    const winnerExpected = calculateWinProbability(awayElo, homeElo, false);
                    const eloChange = K_FACTOR * (1 - winnerExpected);
                    simElo[awayIdx] = awayElo + eloChange;
                    simElo[homeIdx] = homeElo - eloChange;
                }
            }
        }

        // Calculate SOV and SOS using NFL definition (combined opponent record; weighted by games played)
        computeScheduleStrength({
            statsMap,
            scheduleMap,
            winsAgainst: simWinsAgainst,
            teamIdToIdx,
            numTeams
        });

        // Determine playoff spots (use pre-split conference/division arrays)
        const processConference = (divisionMap: Map<string, Team[]>) => {
            const divWinners: Team[] = [];
            const wcPool: Team[] = [];

            for (const div of divisions) {
                const divTeams = divisionMap.get(div)!;
                const sorted = sortTeams(divTeams, statsMap, allGames, gameResults, 'division', scheduleMap, teamGamesMap);
                if (sorted.length > 0) {
                    divWinners.push(sorted[0]);
                    for (let i = 1; i < sorted.length; i++) {
                        wcPool.push(sorted[i]);
                    }
                }
            }

            const seededWinners = sortTeams(divWinners, statsMap, allGames, gameResults, 'wildcard', scheduleMap, teamGamesMap);
            const seededWildcards = sortTeams(wcPool, statsMap, allGames, gameResults, 'wildcard', scheduleMap, teamGamesMap);

            return {
                winners: seededWinners,
                wildcards: seededWildcards.slice(0, 3),
                firstSeed: seededWinners[0] ?? null
            };
        };

        const afc = processConference(afcByDiv);
        const nfc = processConference(nfcByDiv);

        // Update results using typed arrays
        for (const t of afc.winners) {
            const idx = teamIdToIdx.get(t.id)!;
            madePlayoffs[idx]++;
            wonDivision[idx]++;
        }
        for (const t of nfc.winners) {
            const idx = teamIdToIdx.get(t.id)!;
            madePlayoffs[idx]++;
            wonDivision[idx]++;
        }
        for (const t of afc.wildcards) {
            const idx = teamIdToIdx.get(t.id)!;
            madePlayoffs[idx]++;
            madeWildcard[idx]++;
        }
        for (const t of nfc.wildcards) {
            const idx = teamIdToIdx.get(t.id)!;
            madePlayoffs[idx]++;
            madeWildcard[idx]++;
        }

        if (afc.firstSeed) wonFirstSeed[teamIdToIdx.get(afc.firstSeed.id)!]++;
        if (nfc.firstSeed) wonFirstSeed[teamIdToIdx.get(nfc.firstSeed.id)!]++;
    }

    // Calculate simulated odds from typed array
    const simulatedOdds = new Map<string, number>();
    remainingGames.forEach((g, idx) => {
        simulatedOdds.set(g.id, gameHomeWins[idx] / numSimulations);
    });

    // Build results from typed arrays
    const teamResults = initialTeams.map((t, idx) => ({
            teamId: t.id,
            teamName: t.name,
        madePlayoffs: madePlayoffs[idx],
        wonDivision: wonDivision[idx],
        madeWildcard: madeWildcard[idx],
        wonFirstSeed: wonFirstSeed[idx],
            totalSimulations: numSimulations,
        playoffProb: madePlayoffs[idx] / numSimulations,
        divisionProb: wonDivision[idx] / numSimulations,
        wildcardProb: madeWildcard[idx] / numSimulations,
        firstSeedProb: wonFirstSeed[idx] / numSimulations
    })).sort((a, b) => b.playoffProb - a.playoffProb);

    return { teamResults, simulatedOdds };
};
