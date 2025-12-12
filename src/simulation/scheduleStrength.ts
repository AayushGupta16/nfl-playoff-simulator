import type { TeamStatsMap } from './tieBreakers';

/**
 * Compute Strength of Schedule (SOS) and Strength of Victory (SOV) using the NFL definition:
 * combined winning percentage of opponents (weighted by opponents' games played),
 * with opponents counted once per game played against them (duplicates allowed).
 */
export function computeScheduleStrength(params: {
  statsMap: TeamStatsMap;
  scheduleMap: Map<string, string[]>; // teamId -> opponentIds (one entry per game, duplicates allowed)
  winsAgainst: Map<string, string[]>; // teamId -> defeated opponentIds (one entry per win, duplicates allowed)
  teamIdToIdx: Map<string, number>;
  numTeams: number;
}): void {
  const { statsMap, scheduleMap, winsAgainst, teamIdToIdx, numTeams } = params;

  const oppWeightedWins = new Float64Array(numTeams);
  const oppTotals = new Float64Array(numTeams);

  statsMap.forEach((stats, tid) => {
    const idx = teamIdToIdx.get(tid);
    if (idx === undefined) return;
    const total = stats.wins + stats.losses + stats.ties;
    oppTotals[idx] = total;
    oppWeightedWins[idx] = stats.wins + 0.5 * stats.ties;
  });

  statsMap.forEach((stats, tid) => {
    // SOS: combined record of all opponents.
    const opponents = scheduleMap.get(tid) ?? [];
    let sosWins = 0;
    let sosTotal = 0;
    for (const oppId of opponents) {
      const oppIdx = teamIdToIdx.get(oppId);
      if (oppIdx === undefined) continue;
      sosWins += oppWeightedWins[oppIdx];
      sosTotal += oppTotals[oppIdx];
    }
    stats.sos = sosTotal > 0 ? sosWins / sosTotal : 0;

    // SOV: combined record of defeated opponents.
    const defeated = winsAgainst.get(tid) ?? [];
    let sovWins = 0;
    let sovTotal = 0;
    for (const oppId of defeated) {
      const oppIdx = teamIdToIdx.get(oppId);
      if (oppIdx === undefined) continue;
      sovWins += oppWeightedWins[oppIdx];
      sovTotal += oppTotals[oppIdx];
    }
    stats.sov = sovTotal > 0 ? sovWins / sovTotal : 0;
  });
}


