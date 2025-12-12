import { describe, it, expect } from 'vitest';
import { computeScheduleStrength } from './scheduleStrength';
import type { TeamStatsMap, SeasonStats } from './tieBreakers';

const stats = (overrides: Partial<SeasonStats> = {}): SeasonStats => ({
  wins: 0,
  losses: 0,
  ties: 0,
  divWins: 0,
  divLosses: 0,
  divTies: 0,
  confWins: 0,
  confLosses: 0,
  confTies: 0,
  sov: 0,
  sos: 0,
  gamesPlayed: new Map(),
  ...overrides,
});

describe('computeScheduleStrength (SOS/SOV)', () => {
  it('computes SOS as combined opponent winning percentage (weighted by games played)', () => {
    // Opponents with different games played should be weighted accordingly.
    //
    // Team A plays X once and Y once.
    // X: 9-1 (0.900) over 10 games
    // Y: 8-8 (0.500) over 16 games
    //
    // Combined SOS = (9 + 8) / (10 + 16) = 17/26 ≈ 0.653846...
    // Simple average win% would be (0.9 + 0.5)/2 = 0.7 (WRONG).
    const statsMap: TeamStatsMap = new Map([
      ['A', stats()],
      ['X', stats({ wins: 9, losses: 1 })],
      ['Y', stats({ wins: 8, losses: 8 })],
    ]);

    const scheduleMap = new Map<string, string[]>([
      ['A', ['X', 'Y']],
      ['X', ['A']],
      ['Y', ['A']],
    ]);
    const winsAgainst = new Map<string, string[]>([
      ['A', []],
      ['X', []],
      ['Y', []],
    ]);
    const teamIdToIdx = new Map<string, number>([
      ['A', 0],
      ['X', 1],
      ['Y', 2],
    ]);

    computeScheduleStrength({ statsMap, scheduleMap, winsAgainst, teamIdToIdx, numTeams: 3 });
    expect(statsMap.get('A')!.sos).toBeCloseTo(17 / 26, 6);
  });

  it('computes SOV as combined winning percentage of defeated opponents', () => {
    // A beat X twice and Y once -> duplicates are counted (one entry per win).
    // X: 10-7 (10/17)
    // Y: 6-11 (6/17)
    // Combined SOV = (10 + 10 + 6) / (17 + 17 + 17) = 26/51 ≈ 0.5098
    const statsMap: TeamStatsMap = new Map([
      ['A', stats()],
      ['X', stats({ wins: 10, losses: 7 })],
      ['Y', stats({ wins: 6, losses: 11 })],
    ]);

    const scheduleMap = new Map<string, string[]>([
      ['A', ['X', 'X', 'Y']],
      ['X', ['A', 'A']],
      ['Y', ['A']],
    ]);
    const winsAgainst = new Map<string, string[]>([
      ['A', ['X', 'X', 'Y']],
      ['X', []],
      ['Y', []],
    ]);
    const teamIdToIdx = new Map<string, number>([
      ['A', 0],
      ['X', 1],
      ['Y', 2],
    ]);

    computeScheduleStrength({ statsMap, scheduleMap, winsAgainst, teamIdToIdx, numTeams: 3 });
    expect(statsMap.get('A')!.sov).toBeCloseTo(26 / 51, 6);
  });
});


