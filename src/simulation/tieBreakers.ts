/**
 * NFL Tiebreaker Implementation (partial)
 *
 * Based on: https://www.nfl.com/standings/tie-breaking-procedures
 *
 * This implementation follows the official ordering through the "schedule strength"
 * style metrics, then falls back to a coin toss. We intentionally skip the
 * point-based and "combined ranking" steps that require detailed score modeling.
 *
 * DIVISION TIEBREAKER (two clubs) — IMPLEMENTED STEPS:
 * 1. Head-to-head
 * 2. Division record
 * 3. Common games (min 4)
 * 4. Conference record
 * 5. Strength of Victory (SOV)
 * 6. Strength of Schedule (SOS)
 * 7. Coin toss
 *
 * WILDCARD TIEBREAKER (two clubs) — IMPLEMENTED STEPS:
 * 1. Head-to-head (if played; for 3+ teams, only a clean sweep counts)
 * 2. Conference record
 * 3. Common games (min 4)
 * 4. Strength of Victory
 * 5. Strength of Schedule
 * 6. Coin toss
 *
 * NOT IMPLEMENTED:
 * - Combined ranking in points scored and points allowed (conference / all games)
 * - Net points in conference / common / all games
 * - Net touchdowns in all games
 *
 * For 3+ team ties, we apply sweep logic (one team beats all others) and then
 * fall back to the two-team procedure when possible.
 */

import type { Team, Game } from '../types';

const EPSILON = 1e-9;

export type SeasonStats = {
    wins: number;
    losses: number;
    ties: number;
    divWins: number;
    divLosses: number;
    divTies: number;
    confWins: number;
    confLosses: number;
    confTies: number;
    sov: number;
    sos: number;
    gamesPlayed: Map<string, 'W' | 'L' | 'T'>;
};

export type TeamStatsMap = Map<string, SeasonStats>;

// --- STAT HELPERS ---

const getWinPct = (stats: SeasonStats | undefined): number => {
    if (!stats) return 0;
    const total = stats.wins + stats.losses + stats.ties;
    return total === 0 ? 0 : (stats.wins + 0.5 * stats.ties) / total;
};

const getDivPct = (stats: SeasonStats): number => {
    const total = stats.divWins + stats.divLosses + stats.divTies;
    return total === 0 ? 0 : (stats.divWins + 0.5 * stats.divTies) / total;
};

const getConfPct = (stats: SeasonStats): number => {
    const total = stats.confWins + stats.confLosses + stats.confTies;
    return total === 0 ? 0 : (stats.confWins + 0.5 * stats.confTies) / total;
};

const getH2HRecord = (
    teamId: string,
    opponentIds: Set<string>,
    teamGames: Game[],
    gameResults: Map<string, string>
): { wins: number; losses: number; ties: number; opponentsPlayed: Set<string> } => {
    let wins = 0, losses = 0, ties = 0;
    const opponentsPlayed = new Set<string>();

    for (const g of teamGames) {
        const isHome = g.homeTeamId === teamId;
        const oppId = isHome ? g.awayTeamId : g.homeTeamId;

        if (!opponentIds.has(oppId)) continue;

        const winnerId = gameResults.get(g.id);
        if (!winnerId) continue;

        opponentsPlayed.add(oppId);
        if (winnerId === 'TIE') ties++;
        else if (winnerId === teamId) wins++;
        else losses++;
    }

    return { wins, losses, ties, opponentsPlayed };
};

const getH2HPct = (record: { wins: number; losses: number; ties: number }): number => {
    const total = record.wins + record.losses + record.ties;
    return total === 0 ? 0 : (record.wins + 0.5 * record.ties) / total;
};

const getCommonGamesRecord = (
    teamId: string,
    groupIds: string[],
    teamGames: Game[],
    gameResults: Map<string, string>,
    opponentsMap: Map<string, string[]>
): { wins: number; losses: number; ties: number; valid: boolean } => {
    const groupSet = new Set(groupIds);

    let commonOpponents: Set<string> | null = null;
    for (const tid of groupIds) {
        const opps = new Set((opponentsMap.get(tid) || []).filter(o => !groupSet.has(o)));
        if (commonOpponents === null) {
            commonOpponents = opps;
        } else {
            for (const o of commonOpponents) {
                if (!opps.has(o)) commonOpponents.delete(o);
            }
        }
        if (commonOpponents.size < 4) break;
    }

    if (!commonOpponents || commonOpponents.size < 4) {
        return { wins: 0, losses: 0, ties: 0, valid: false };
    }

    let wins = 0, losses = 0, ties = 0;
    for (const g of teamGames) {
        const isHome = g.homeTeamId === teamId;
        const oppId = isHome ? g.awayTeamId : g.homeTeamId;
        if (!commonOpponents.has(oppId)) continue;

        const winner = gameResults.get(g.id);
        if (!winner) continue;
        if (winner === 'TIE') ties++;
        else if (winner === teamId) wins++;
        else losses++;
    }

    return { wins, losses, ties, valid: true };
};

// --- TIEBREAKER STEP DEFINITIONS ---

type TiebreakerResult = { survivors: Team[]; eliminated: boolean };

const applyBestMetric = (
    pool: Team[],
    getValue: (t: Team) => number
): TiebreakerResult => {
    if (pool.length <= 1) return { survivors: pool, eliminated: false };

    const scored = pool.map(t => ({ team: t, val: getValue(t) }));
    const maxVal = Math.max(...scored.map(s => s.val));
    const best = scored.filter(s => Math.abs(s.val - maxVal) < EPSILON).map(s => s.team);

    return {
        survivors: best,
        eliminated: best.length < pool.length
    };
};

const applyDivisionH2H = (
    pool: Team[],
    gameResults: Map<string, string>,
    teamGamesMap: Map<string, Game[]>
): TiebreakerResult => {
    if (pool.length <= 1) return { survivors: pool, eliminated: false };

    const ids = new Set(pool.map(t => t.id));
    const records = pool.map(t => {
        const games = teamGamesMap.get(t.id) ?? [];
        const record = getH2HRecord(t.id, ids, games, gameResults);
        return { team: t, pct: getH2HPct(record) };
    });

    const maxPct = Math.max(...records.map(r => r.pct));
    const best = records.filter(r => Math.abs(r.pct - maxPct) < EPSILON).map(r => r.team);

    return { survivors: best, eliminated: best.length < pool.length };
};

const applyWildcardH2H = (
    pool: Team[],
    gameResults: Map<string, string>,
    teamGamesMap: Map<string, Game[]>
): TiebreakerResult => {
    if (pool.length <= 1) return { survivors: pool, eliminated: false };

    const ids = new Set(pool.map(t => t.id));
    const records = pool.map(t => {
        const games = teamGamesMap.get(t.id) ?? [];
        const record = getH2HRecord(t.id, ids, games, gameResults);
        return { team: t, record, pct: getH2HPct(record) };
    });

    if (pool.length === 2) {
        const maxPct = Math.max(...records.map(r => r.pct));
        const best = records.filter(r => Math.abs(r.pct - maxPct) < EPSILON).map(r => r.team);
        return { survivors: best, eliminated: best.length < pool.length };
    }

    // 3+ teams: check for sweep
    // Rule: "Applicable only if one club has defeated each of the others or if one club has lost to each of the others."
    
    const otherTeamCount = pool.length - 1;
    
    // 1. Check for a "sweeper" (team that beat everyone else)
    // There can only be one sweeper in a group of 3+ teams.
    const sweepers = records.filter(r =>
        r.record.opponentsPlayed.size === otherTeamCount && // Played everyone
        r.record.losses === 0 &&
        r.record.ties === 0 &&
        r.record.wins > 0 // Redundant but safe
    );

    if (sweepers.length === 1) {
        return { survivors: [sweepers[0].team], eliminated: true };
    }

    // 2. Check for "swept" teams (teams that lost to everyone else)
    // Multiple teams could be swept (e.g. A beats B & C, B beats C. C is swept by A & B? No, B beats C. A beats C. C is swept.)
    // Wait, "lost to EACH of the others".
    const swept = records.filter(r =>
        r.record.opponentsPlayed.size === otherTeamCount && // Played everyone
        r.record.wins === 0 &&
        r.record.ties === 0 &&
        r.record.losses > 0
    );

    if (swept.length > 0 && swept.length < pool.length) {
        const sweptIds = new Set(swept.map(s => s.team.id));
        return {
            survivors: pool.filter(t => !sweptIds.has(t.id)),
            eliminated: true
        };
    }

    // No sweep logic applies -> proceed to next step
    return { survivors: pool, eliminated: false };
};

const applyCommonGames = (
    pool: Team[],
    gameResults: Map<string, string>,
    opponentsMap: Map<string, string[]>,
    teamGamesMap: Map<string, Game[]>
): TiebreakerResult => {
    if (pool.length <= 1) return { survivors: pool, eliminated: false };

    const ids = pool.map(t => t.id);
    const records = pool.map(t => {
        const games = teamGamesMap.get(t.id) ?? [];
        const record = getCommonGamesRecord(t.id, ids, games, gameResults, opponentsMap);
        const pct = record.valid
            ? (record.wins + 0.5 * record.ties) / (record.wins + record.losses + record.ties || 1)
            : -1;
        return { team: t, pct, valid: record.valid };
    });

    if (records.some(r => !r.valid)) {
        return { survivors: pool, eliminated: false };
    }

    const maxPct = Math.max(...records.map(r => r.pct));
    const best = records.filter(r => Math.abs(r.pct - maxPct) < EPSILON).map(r => r.team);

    return { survivors: best, eliminated: best.length < pool.length };
};

/**
 * Final tiebreaker: random selection.
 * The NFL uses a coin toss; we use Math.random().
 * This is explicitly the last resort per NFL rules.
 */
const applyCoinToss = (pool: Team[]): TiebreakerResult => {
    if (pool.length <= 1) return { survivors: pool, eliminated: false };
    const winner = pool[Math.floor(Math.random() * pool.length)];
    return { survivors: [winner], eliminated: true };
};

// --- MAIN TIEBREAKER ENGINE ---

export const sortTeams = (
    teams: Team[],
    statsMap: TeamStatsMap,
    allGames: Game[],
    gameResults: Map<string, string>,
    type: 'division' | 'wildcard',
    opponentsMap: Map<string, string[]>,
    teamGamesMap?: Map<string, Game[]>
): Team[] => {
    const byWinPct = [...teams].sort((a, b) => {
        return getWinPct(statsMap.get(b.id)) - getWinPct(statsMap.get(a.id));
    });

    const result: Team[] = [];
    let i = 0;

    while (i < byWinPct.length) {
        const currentPct = getWinPct(statsMap.get(byWinPct[i].id));

        const tiedGroup: Team[] = [byWinPct[i]];
        let j = i + 1;
        while (j < byWinPct.length) {
            const nextPct = getWinPct(statsMap.get(byWinPct[j].id));
            if (Math.abs(nextPct - currentPct) < EPSILON) {
                tiedGroup.push(byWinPct[j]);
                j++;
            } else {
                break;
            }
        }

        if (tiedGroup.length === 1) {
            result.push(tiedGroup[0]);
        } else {
            const resolved = resolveTiedGroup(
                tiedGroup, statsMap, allGames, gameResults, type, opponentsMap, teamGamesMap ?? new Map()
            );
            result.push(...resolved);
        }

        i = j;
    }

    return result;
};

const resolveTiedGroup = (
    group: Team[],
    statsMap: TeamStatsMap,
    allGames: Game[],
    gameResults: Map<string, string>,
    type: 'division' | 'wildcard',
    opponentsMap: Map<string, string[]>,
    teamGamesMap: Map<string, Game[]>
): Team[] => {
    const ranked: Team[] = [];
    let remaining = [...group];

    while (remaining.length > 0) {
        if (remaining.length === 1) {
            ranked.push(remaining[0]);
            break;
        }

        const winner = findTiebreakerWinner(
            remaining, statsMap, allGames, gameResults, type, opponentsMap, teamGamesMap
        );

        ranked.push(...winner);
        const winnerIds = new Set(winner.map(w => w.id));
        remaining = remaining.filter(t => !winnerIds.has(t.id));
    }

    return ranked;
};

const findTiebreakerWinner = (
    candidates: Team[],
    statsMap: TeamStatsMap,
    allGames: Game[],
    gameResults: Map<string, string>,
    type: 'division' | 'wildcard',
    opponentsMap: Map<string, string[]>,
    teamGamesMap: Map<string, Game[]>
): Team[] => {
    let pool = [...candidates];

    // Wildcard pre-step: best team from each division
    if (type === 'wildcard') {
        const byDiv = new Map<string, Team[]>();
        pool.forEach(t => {
            const div = t.division;
            if (!byDiv.has(div)) byDiv.set(div, []);
            byDiv.get(div)!.push(t);
        });

        const filtered: Team[] = [];
        byDiv.forEach(divTeams => {
            if (divTeams.length === 1) {
                filtered.push(divTeams[0]);
            } else {
                const best = findTiebreakerWinner(
                    divTeams, statsMap, allGames, gameResults, 'division', opponentsMap, teamGamesMap
                );
                filtered.push(best[0]);
            }
        });
        pool = filtered;
    }

    if (pool.length === 1) return pool;

    const steps = buildTiebreakerSteps(type, statsMap, gameResults, opponentsMap, teamGamesMap);

    let stepIdx = 0;
    
    // Maximum loop count to prevent infinite loops in case of logic error.
    // In theory, we restart at most N-1 times (where N is number of candidates).
    // 50 is plenty.
    let iterations = 0;
    const MAX_ITERATIONS = 50; 

    while (stepIdx < steps.length && iterations < MAX_ITERATIONS) {
        iterations++;
        const { survivors, eliminated } = steps[stepIdx](pool);

        if (eliminated) {
            pool = survivors;
            if (pool.length === 1) return pool;
            stepIdx = 0; // NFL rule: restart after elimination
        } else {
            stepIdx++;
        }
    }

    // All steps exhausted, still tied: coin toss (per NFL rules)
    return applyCoinToss(pool).survivors;
};

/**
 * NFL tiebreaker steps we actually apply.
 *
 * DIVISION:
 * 1. Head-to-head
 * 2. Division record
 * 3. Common games (min 4)
 * 4. Conference record
 * 5. Strength of Victory (SOV)
 * 6. Strength of Schedule (SOS)
 * 7. Coin toss (handled in applyCoinToss as a last resort)
 *
 * WILDCARD:
 * 1. Head-to-head (if played; sweep logic for 3+ teams)
 * 2. Conference record
 * 3. Common games (min 4)
 * 4. Strength of Victory
 * 5. Strength of Schedule
 * 6. Coin toss
 */
const buildTiebreakerSteps = (
    type: 'division' | 'wildcard',
    statsMap: TeamStatsMap,
    gameResults: Map<string, string>,
    opponentsMap: Map<string, string[]>,
    teamGamesMap: Map<string, Game[]>
): Array<(pool: Team[]) => TiebreakerResult> => {
    const steps: Array<(pool: Team[]) => TiebreakerResult> = [];

    if (type === 'division') {
        steps.push(pool => applyDivisionH2H(pool, gameResults, teamGamesMap));
        steps.push(pool => applyBestMetric(pool, t => getDivPct(statsMap.get(t.id)!)));
        steps.push(pool => applyCommonGames(pool, gameResults, opponentsMap, teamGamesMap));
        steps.push(pool => applyBestMetric(pool, t => getConfPct(statsMap.get(t.id)!)));
        steps.push(pool => applyBestMetric(pool, t => statsMap.get(t.id)!.sov));
        steps.push(pool => applyBestMetric(pool, t => statsMap.get(t.id)!.sos));
    } else {
        steps.push(pool => applyWildcardH2H(pool, gameResults, teamGamesMap));
        steps.push(pool => applyBestMetric(pool, t => getConfPct(statsMap.get(t.id)!)));
        steps.push(pool => applyCommonGames(pool, gameResults, opponentsMap, teamGamesMap));
        steps.push(pool => applyBestMetric(pool, t => statsMap.get(t.id)!.sov));
        steps.push(pool => applyBestMetric(pool, t => statsMap.get(t.id)!.sos));
    }

    return steps;
};
