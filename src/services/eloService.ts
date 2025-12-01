/**
 * Elo rating system for NFL teams.
 *
 * Baseline Elo comes from Kalshi "Season Win Total" markets.
 * Game updates use margin-of-victory adjustments (538-style).
 */

import axios from 'axios';

// --- CONSTANTS ---
// These are configurable assumptions. See docs for rationale.

const BASE_ELO = 1500;

/**
 * Home field advantage in Elo points.
 *
 * 48 pts → ~57% home win rate. This is a rough estimate based on
 * recent NFL seasons (2018-2023) where HFA has declined from historical
 * levels (~65 pts in the 2000s). No rigorous calibration was done for
 * this specific value; it's borrowed from common Elo implementations.
 *
 * Math: P = 1 / (1 + 10^(-48/400)) ≈ 0.568
 */
export const HOME_FIELD_ADVANTAGE = 48;

/**
 * K-factor: how much each game moves Elo ratings.
 * 20 is the value 538 used for NFL. We use it without modification.
 */
const K_FACTOR = 20;

/**
 * Elo points per expected win above/below 8.5.
 *
 * This maps expected wins to Elo: Elo = 1500 + (wins - 8.5) * 28
 * The value 28 was chosen so that a 7-win difference (e.g., 12 vs 5)
 * produces ~75% win probability, which roughly matches NFL historical
 * data. This is an approximation, not a rigorous fit.
 */
const ELO_PER_WIN = 28;

/**
 * Pythagorean exponent for estimating "true" wins from point differential.
 * 2.37 is from Football Outsiders / 538 research on NFL scoring.
 */
const PYTHAGOREAN_EXPONENT = 2.37;

// In production, we use a serverless function that takes path as a query param
const IS_PROD = typeof window !== 'undefined' && !window.location.hostname.includes('localhost');
const KALSHI_BASE_URL = IS_PROD ? '/api/kalshi' : '/api/kalshi/trade-api/v2';

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
        const url = new URL(`${KALSHI_BASE_URL}/${endpoint}`, window.location.origin);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.set(key, String(value));
            });
        }
        return url.toString();
    }
};

// --- TEAM ABBREVIATION MAPPINGS ---

const NAME_TO_KALSHI_ABBR: Record<string, string> = {
    "Buffalo Bills": "BUF", "Miami Dolphins": "MIA", "New England Patriots": "NE", "New York Jets": "NYJ",
    "Baltimore Ravens": "BAL", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Pittsburgh Steelers": "PIT",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAC", "Tennessee Titans": "TEN",
    "Denver Broncos": "DEN", "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Dallas Cowboys": "DAL", "New York Giants": "NYG", "Philadelphia Eagles": "PHI", "Washington Commanders": "WAS",
    "Chicago Bears": "CHI", "Detroit Lions": "DET", "Green Bay Packers": "GB", "Minnesota Vikings": "MIN",
    "Atlanta Falcons": "ATL", "Carolina Panthers": "CAR", "New Orleans Saints": "NO", "Tampa Bay Buccaneers": "TB",
    "Arizona Cardinals": "ARI", "Los Angeles Rams": "LA", "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA"
};

const KALSHI_ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
    Object.entries(NAME_TO_KALSHI_ABBR).map(([name, abbr]) => [abbr, name])
);

// --- INTERFACES ---

export interface TeamElo {
    teamId: string;
    teamName: string;
    elo: number;
    preseasonElo: number;
    expectedWins: number;
    actualWins: number;
    pointsFor: number;
    pointsAgainst: number;
    pythagoreanWins: number;
    luckFactor: number;
}

interface KalshiWinMarket {
    ticker: string;
    threshold: number;
    probability: number;
}

// --- KALSHI WIN TOTALS ---

/**
 * Fetches season win total markets from Kalshi.
 * Returns expected wins for each team based on P(wins > k) markets.
 */
export const fetchKalshiWinTotals = async (): Promise<Map<string, number>> => {
    const expectedWinsMap = new Map<string, number>();

    console.log("Fetching Kalshi season win totals...");

    try {
        const seriesResponse = await axios.get(buildKalshiUrl('series', { limit: 200 }));
        const nflWinSeries = seriesResponse.data.series?.filter((s: any) =>
            s.ticker.startsWith('KXNFLWINS-') && !s.ticker.includes('EXACT')
        ) || [];

        console.log(`  Found ${nflWinSeries.length} team win total series`);

        const marketPromises = nflWinSeries.map(async (series: any) => {
            const teamAbbr = series.ticker.replace('KXNFLWINS-', '');
            const teamName = KALSHI_ABBR_TO_NAME[teamAbbr];

            if (!teamName) {
                console.log(`  Unknown abbreviation: ${teamAbbr}`);
                return;
            }

            try {
                const marketsResponse = await axios.get(buildKalshiUrl('markets', {
                    series_ticker: series.ticker,
                    limit: 50,
                    status: 'open'
                }));

                const markets = marketsResponse.data.markets || [];
                const winMarkets: KalshiWinMarket[] = [];

                for (const market of markets) {
                    const match = market.ticker.match(/-T(\d+)$/);
                    if (!match) continue;

                    const threshold = parseInt(match[1]);
                    let probability: number;

                    if (market.yes_bid > 0 && market.yes_ask > 0 && market.yes_ask < 100) {
                        probability = (market.yes_bid + market.yes_ask) / 2 / 100;
                    } else if (market.last_price > 0) {
                        probability = market.last_price / 100;
                    } else {
                        continue;
                    }

                    winMarkets.push({ ticker: market.ticker, threshold, probability });
                }

                const expectedWins = calculateExpectedWins(winMarkets);
                if (expectedWins > 0) {
                    expectedWinsMap.set(teamName, expectedWins);
                }
            } catch (err) {
                console.warn(`  Failed to fetch markets for ${teamName}`, err);
            }
        });

        await Promise.all(marketPromises);
        console.log(`  Got expected wins for ${expectedWinsMap.size} teams`);
    } catch (error) {
        console.warn("Failed to fetch Kalshi win totals:", error);
    }

    return expectedWinsMap;
};

/**
 * Calculates expected wins using tail sum: E[X] = Σ P(X > k) for k=0..16
 *
 * ASSUMPTION: When the k=0 market is missing (no "will team win > 0 games"
 * contract), we assume P(wins > 0) = 0.99. This is reasonable since every
 * NFL team wins at least 1 game in practice, but it's still an assumption.
 *
 * For missing intermediate thresholds, we skip them (contribute 0), which
 * underestimates expected wins slightly. This is conservative.
 */
const calculateExpectedWins = (markets: KalshiWinMarket[]): number => {
    markets.sort((a, b) => a.threshold - b.threshold);

    let expected = 0;
    for (let k = 0; k <= 16; k++) {
        const market = markets.find(m => m.threshold === k);
        if (market) {
            expected += market.probability;
        } else if (k === 0) {
            // ASSUMPTION: P(>0 wins) ≈ 1 for any NFL team
            expected += 0.99;
        }
        // Missing intermediate markets contribute 0 (conservative)
    }

    return expected;
};

// --- ELO CALCULATIONS ---

export const winsToElo = (expectedWins: number): number => {
    return BASE_ELO + (expectedWins - 8.5) * ELO_PER_WIN;
};

export const eloToWins = (elo: number): number => {
    return 8.5 + (elo - BASE_ELO) / ELO_PER_WIN;
};

/**
 * Win probability from Elo ratings.
 * P = 1 / (1 + 10^(-eloDiff/400))
 */
export const calculateWinProbability = (
    teamElo: number,
    opponentElo: number,
    isHome: boolean
): number => {
    const hfa = isHome ? HOME_FIELD_ADVANTAGE : -HOME_FIELD_ADVANTAGE;
    const diff = teamElo - opponentElo + hfa;
    const prob = 1 / (1 + Math.pow(10, -diff / 400));
    return Math.max(0.01, Math.min(0.99, prob));
};

/**
 * Margin of Victory multiplier for Elo updates.
 *
 * Uses log scaling with autocorrelation adjustment:
 * - Log dampens blowouts (21-pt win isn't 3x more impressive than 7-pt)
 * - Autocorrelation reduces credit when favorites win big
 *
 * Formula: ln(|PD| + 1) * (2.2 / (eloDiff * 0.001 + 2.2))
 */
export const calculateMOVMultiplier = (
    pointDiff: number,
    winnerEloDiff: number
): number => {
    const movBase = Math.log(Math.abs(pointDiff) + 1);
    const autocorrelation = 2.2 / ((winnerEloDiff * 0.001) + 2.2);
    return movBase * autocorrelation;
};

export const updateEloAfterGame = (
    winnerElo: number,
    loserElo: number,
    pointDiff: number,
    winnerWasHome: boolean
): { newWinnerElo: number; newLoserElo: number; eloChange: number } => {
    const winnerExpected = calculateWinProbability(winnerElo, loserElo, winnerWasHome);
    const hfa = winnerWasHome ? HOME_FIELD_ADVANTAGE : -HOME_FIELD_ADVANTAGE;
    const eloDiffWinner = winnerElo - loserElo + hfa;
    const movMultiplier = calculateMOVMultiplier(pointDiff, eloDiffWinner);
    const eloChange = K_FACTOR * (1 - winnerExpected) * movMultiplier;

    return {
        newWinnerElo: winnerElo + eloChange,
        newLoserElo: loserElo - eloChange,
        eloChange
    };
};

export const updateEloAfterTie = (
    team1Elo: number,
    team2Elo: number,
    team1WasHome: boolean
): { newTeam1Elo: number; newTeam2Elo: number } => {
    const team1Expected = calculateWinProbability(team1Elo, team2Elo, team1WasHome);
    const eloChange = K_FACTOR * (0.5 - team1Expected);

    return {
        newTeam1Elo: team1Elo + eloChange,
        newTeam2Elo: team2Elo - eloChange
    };
};

// --- PYTHAGOREAN WINS ---

export const calculatePythagoreanWins = (
    pointsFor: number,
    pointsAgainst: number,
    gamesPlayed: number
): number => {
    if (pointsFor === 0 && pointsAgainst === 0) return gamesPlayed / 2;
    if (pointsAgainst === 0) return gamesPlayed;

    const pfExp = Math.pow(pointsFor, PYTHAGOREAN_EXPONENT);
    const paExp = Math.pow(pointsAgainst, PYTHAGOREAN_EXPONENT);
    return (pfExp / (pfExp + paExp)) * gamesPlayed;
};

export const calculateLuckFactor = (actualWins: number, pythagoreanWins: number): number => {
    return actualWins - pythagoreanWins;
};

// --- ELO INITIALIZATION ---

export const initializeTeamElos = async (
    teams: Array<{ id: string; name: string; wins: number; losses: number; pointsFor?: number; pointsAgainst?: number }>
): Promise<Map<string, TeamElo>> => {
    const eloMap = new Map<string, TeamElo>();
    const kalshiWins = await fetchKalshiWinTotals();

    for (const team of teams) {
        const expectedWins = kalshiWins.get(team.name);
        if (expectedWins === undefined) {
            throw new Error(`Missing Kalshi data for: ${team.name}`);
        }

        const preseasonElo = winsToElo(expectedWins);
        const gamesPlayed = team.wins + team.losses;
        const pf = team.pointsFor ?? 0;
        const pa = team.pointsAgainst ?? 0;
        const pythagoreanWins = calculatePythagoreanWins(pf, pa, gamesPlayed);

        eloMap.set(team.id, {
            teamId: team.id,
            teamName: team.name,
            elo: preseasonElo,
            preseasonElo,
            expectedWins,
            actualWins: team.wins,
            pointsFor: pf,
            pointsAgainst: pa,
            pythagoreanWins,
            luckFactor: calculateLuckFactor(team.wins, pythagoreanWins)
        });
    }

    console.log(`Initialized Elo for ${eloMap.size} teams`);
    return eloMap;
};

// --- ELO FALLBACK FOR UI ---

/**
 * Fills in **Elo-based fallback odds only** for games without Kalshi market data.
 *
 * - Returns a map of *only* Elo-derived odds (no Kalshi entries).
 * - The caller is responsible for merging these with real Kalshi odds for UI display.
 * - In the simulation, we pass only true market odds so that Elo-based games
 *   can use dynamic `simElo` for path-dependent win probabilities.
 */
export const applyEloOdds = (
    games: Array<{ id: string; homeTeamId: string; awayTeamId: string; isFinished: boolean }>,
    teams: Array<{ id: string; name: string; wins: number; losses: number; ties: number }>,
    kalshiOdds: Map<string, number>
): Map<string, number> => {
    // This map will contain **only** Elo fallback odds for games with no Kalshi market.
    const fallbackOdds = new Map<string, number>();

    // Simple Elo from current record as a reasonable UI fallback
    const eloMap = new Map<string, number>();
    teams.forEach(t => {
        const total = t.wins + t.losses + t.ties;
        const winPct = total > 0 ? (t.wins + 0.5 * t.ties) / total : 0.5;
        eloMap.set(t.id, winsToElo(winPct * 17));
    });

    games.forEach(game => {
        // Skip finished games or games that already have a real Kalshi market
        if (game.isFinished || kalshiOdds.has(game.id)) return;
        if (!game.homeTeamId || !game.awayTeamId || game.homeTeamId === '-1') return;

        const homeElo = eloMap.get(game.homeTeamId);
        const awayElo = eloMap.get(game.awayTeamId);

        if (homeElo !== undefined && awayElo !== undefined) {
            fallbackOdds.set(game.id, calculateWinProbability(homeElo, awayElo, true));
        }
    });

    return fallbackOdds;
};

/**
 * Creates Elo map from Kalshi win totals.
 * This is the main entry point for simulation initialization.
 */
export const createPreseasonEloMap = async (
    teams: Array<{ id: string; name: string; wins: number; losses: number }>
): Promise<Map<string, number>> => {
    const kalshiWins = await fetchKalshiWinTotals();
    const eloMap = new Map<string, number>();

    teams.forEach(t => {
        const expectedWins = kalshiWins.get(t.name);
        if (expectedWins !== undefined) {
            eloMap.set(t.id, winsToElo(expectedWins));
        } else {
            throw new Error(`Missing Kalshi data for: ${t.name}`);
        }
    });

    return eloMap;
};
