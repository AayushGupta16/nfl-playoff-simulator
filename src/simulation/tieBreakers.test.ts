import { describe, it, expect, vi, afterEach } from 'vitest';
import { sortTeams, type TeamStatsMap, type SeasonStats } from './tieBreakers';
import type { Team, Game } from '../types';

const makeTeam = (id: string): Team => ({
  id,
  name: id,
  abbreviation: id,
  wins: 0,
  losses: 0,
  ties: 0,
  divisionWins: 0,
  divisionLosses: 0,
  divisionTies: 0,
  conferenceWins: 0,
  conferenceLosses: 0,
  conferenceTies: 0,
  conference: 'NFC',
  division: 'North',
});

const makeStats = (overrides: Partial<SeasonStats> = {}): SeasonStats => ({
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

const makeGame = (id: string, home: string, away: string): Game => ({
  id,
  week: 1,
  homeTeamId: home,
  awayTeamId: away,
  homeTeamName: home,
  awayTeamName: away,
  homeWinProb: 0.5,
  isFinished: true,
  winnerId: undefined,
  date: '2025-01-01',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NFL tiebreakers (targeted correctness)', () => {
  it('treats common games as 4 common *games* (not 4 opponents)', () => {
    // Two teams tied in a division.
    // They share 2 common opponents (X, Y) but play each twice -> 4 common games.
    // A goes 4-0, B goes 0-4. All other criteria are tied so common games must decide.
    const A = makeTeam('A');
    const B = makeTeam('B');
    const X = makeTeam('X');
    const Y = makeTeam('Y');

    const allGames: Game[] = [
      // Head-to-head split (so H2H doesn't decide)
      makeGame('ab1', 'A', 'B'),
      makeGame('ab2', 'B', 'A'),

      // Common opponents (2 opponents, 4 games)
      makeGame('ax1', 'A', 'X'),
      makeGame('xa2', 'X', 'A'),
      makeGame('ay1', 'A', 'Y'),
      makeGame('ya2', 'Y', 'A'),

      makeGame('bx1', 'B', 'X'),
      makeGame('xb2', 'X', 'B'),
      makeGame('by1', 'B', 'Y'),
      makeGame('yb2', 'Y', 'B'),
    ];

    const teamGamesMap = new Map<string, Game[]>();
    [A, B, X, Y].forEach(t => teamGamesMap.set(t.id, []));
    for (const g of allGames) {
      teamGamesMap.get(g.homeTeamId)!.push(g);
      teamGamesMap.get(g.awayTeamId)!.push(g);
    }

    // Opponents map intentionally contains duplicates (like monteCarlo's scheduleMap).
    const opponentsMap = new Map<string, string[]>();
    opponentsMap.set('A', ['B', 'B', 'X', 'X', 'Y', 'Y']);
    opponentsMap.set('B', ['A', 'A', 'X', 'X', 'Y', 'Y']);

    const gameResults = new Map<string, string>([
      // H2H split
      ['ab1', 'A'],
      ['ab2', 'B'],

      // A sweeps X/Y
      ['ax1', 'A'],
      ['xa2', 'A'],
      ['ay1', 'A'],
      ['ya2', 'A'],

      // B loses all vs X/Y
      ['bx1', 'X'],
      ['xb2', 'X'],
      ['by1', 'Y'],
      ['yb2', 'Y'],
    ]);

    const statsMap: TeamStatsMap = new Map();
    // Keep everything tied except common games. If common games is skipped (old bug),
    // we'd fall to coin toss, so stub Math.random to pick the "wrong" one deterministically.
    statsMap.set('A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 }));
    statsMap.set('B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 }));

    vi.spyOn(Math, 'random').mockReturnValue(0.99); // would choose index 1 in a 2-team coin toss

    const sorted = sortTeams([A, B], statsMap, allGames, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('does not rank 3+ team division ties by H2H pct unless there is a sweep', () => {
    // 3-team tie: A is 3-1 in H2H, but not a clean sweep; NFL says H2H is not applicable.
    // Division record should decide. We set B with best division record to ensure it wins.
    const A = makeTeam('A');
    const B = makeTeam('B');
    const C = makeTeam('C');

    const games: Game[] = [
      // A beats B twice
      makeGame('ab1', 'A', 'B'),
      makeGame('ab2', 'B', 'A'),
      // B beats C twice
      makeGame('bc1', 'B', 'C'),
      makeGame('bc2', 'C', 'B'),
      // A splits with C
      makeGame('ac1', 'A', 'C'),
      makeGame('ac2', 'C', 'A'),
    ];

    const teamGamesMap = new Map<string, Game[]>();
    [A, B, C].forEach(t => teamGamesMap.set(t.id, []));
    for (const g of games) {
      teamGamesMap.get(g.homeTeamId)!.push(g);
      teamGamesMap.get(g.awayTeamId)!.push(g);
    }

    const opponentsMap = new Map<string, string[]>();
    opponentsMap.set('A', ['B', 'B', 'C', 'C']);
    opponentsMap.set('B', ['A', 'A', 'C', 'C']);
    opponentsMap.set('C', ['A', 'A', 'B', 'B']);

    const gameResults = new Map<string, string>([
      ['ab1', 'A'],
      ['ab2', 'A'],
      ['bc1', 'B'],
      ['bc2', 'B'],
      ['ac1', 'A'],
      ['ac2', 'C'],
    ]);

    const statsMap: TeamStatsMap = new Map();
    // Same overall win pct for all three (what creates the tied group).
    // Make B best in division record.
    statsMap.set('A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 }));
    statsMap.set('B', makeStats({ wins: 10, losses: 7, divWins: 5, divLosses: 1, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 }));
    statsMap.set('C', makeStats({ wins: 10, losses: 7, divWins: 3, divLosses: 3, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 }));

    const sorted = sortTeams([A, B, C], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('B');
  });
});

describe('NFL tiebreakers (broad scenario coverage)', () => {
  /**
   * This suite is intentionally written to match the steps claimed in:
   * - docs/SIMULATION_LOGIC.md
   * - src/simulation/tieBreakers.ts header comment
   *
   * Division (2 clubs) steps we claim:
   * 1) Head-to-head
   * 2) Division record
   * 3) Common games (min 4 common games)
   * 4) Conference record
   * 5) SOV
   * 6) SOS
   * 7) Coin toss
   *
   * Wildcard (2 clubs) steps we claim:
   * 1) Head-to-head (if played; for 3+ teams, sweep-only)
   * 2) Conference record
   * 3) Common games (min 4 common games)
   * 4) SOV
   * 5) SOS
   * 6) Coin toss
   */

  it('division: head-to-head decides (2 teams)', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');

    const games: Game[] = [makeGame('ab1', 'A', 'B')];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', [games[0]]],
      ['B', [games[0]]],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    const gameResults = new Map<string, string>([['ab1', 'A']]);

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7 })],
      ['B', makeStats({ wins: 10, losses: 7 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted.map(t => t.id)).toEqual(['A', 'B']);
  });

  it('division: division record decides after H2H tie', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');

    const games: Game[] = [
      makeGame('ab1', 'A', 'B'),
      makeGame('ab2', 'B', 'A'),
    ];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', games],
      ['B', games],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', ['B', 'B']],
      ['B', ['A', 'A']],
    ]);
    const gameResults = new Map<string, string>([
      ['ab1', 'A'],
      ['ab2', 'B'],
    ]);

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 5, divLosses: 1 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('division: common games decides (minimum 4 common games, not 4 opponents)', () => {
    // 2 common opponents (X, Y) played twice each => 4 common games
    const A = makeTeam('A');
    const B = makeTeam('B');
    const X = makeTeam('X');
    const Y = makeTeam('Y');

    const games: Game[] = [
      // H2H split so step 1 doesn't decide
      makeGame('ab1', 'A', 'B'),
      makeGame('ab2', 'B', 'A'),

      // Common games (A goes 4-0, B goes 0-4)
      makeGame('ax1', 'A', 'X'),
      makeGame('xa2', 'X', 'A'),
      makeGame('ay1', 'A', 'Y'),
      makeGame('ya2', 'Y', 'A'),
      makeGame('bx1', 'B', 'X'),
      makeGame('xb2', 'X', 'B'),
      makeGame('by1', 'B', 'Y'),
      makeGame('yb2', 'Y', 'B'),
    ];

    const teamGamesMap = new Map<string, Game[]>();
    [A, B, X, Y].forEach(t => teamGamesMap.set(t.id, []));
    for (const g of games) {
      teamGamesMap.get(g.homeTeamId)!.push(g);
      teamGamesMap.get(g.awayTeamId)!.push(g);
    }

    const opponentsMap = new Map<string, string[]>();
    opponentsMap.set('A', ['B', 'B', 'X', 'X', 'Y', 'Y']);
    opponentsMap.set('B', ['A', 'A', 'X', 'X', 'Y', 'Y']);

    const gameResults = new Map<string, string>([
      ['ab1', 'A'],
      ['ab2', 'B'],
      ['ax1', 'A'],
      ['xa2', 'A'],
      ['ay1', 'A'],
      ['ya2', 'A'],
      ['bx1', 'X'],
      ['xb2', 'X'],
      ['by1', 'Y'],
      ['yb2', 'Y'],
    ]);

    const statsMap: TeamStatsMap = new Map([
      // Keep division record and conference record equal so common games is the deciding step.
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('division: conference record decides when common games are not applicable', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');

    const games: Game[] = [makeGame('ab1', 'A', 'B')];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', games],
      ['B', games],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    const gameResults = new Map<string, string>([['ab1', 'A']]);

    // Force H2H to tie by making it "not played" from the engine's perspective:
    // (we do that by not providing the result, so H2H pct == 0 for both)
    gameResults.delete('ab1');

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 8, confLosses: 4 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('division: common games is skipped if any club has <4 common games', () => {
    // Common opponents exist (X), but only 2 common games, so common-games step must be "not applicable".
    // Conference record should decide instead.
    const A = makeTeam('A');
    const B = makeTeam('B');
    const X = makeTeam('X');

    const games: Game[] = [
      makeGame('ax1', 'A', 'X'),
      makeGame('bx1', 'B', 'X'),
    ];

    const teamGamesMap = new Map<string, Game[]>();
    [A, B, X].forEach(t => teamGamesMap.set(t.id, []));
    for (const g of games) {
      teamGamesMap.get(g.homeTeamId)!.push(g);
      teamGamesMap.get(g.awayTeamId)!.push(g);
    }

    const opponentsMap = new Map<string, string[]>();
    opponentsMap.set('A', ['X']);
    opponentsMap.set('B', ['X']);

    const gameResults = new Map<string, string>([
      ['ax1', 'A'],
      ['bx1', 'B'],
    ]);

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 8, confLosses: 4, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    // No H2H and division record is tied, so conference record should decide.
    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('division: SOV decides when earlier steps tie', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');

    const games: Game[] = [];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', games],
      ['B', games],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const gameResults = new Map<string, string>();

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.60, sos: 0.55 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.55, sos: 0.60 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('division: SOS decides when SOV ties', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');

    const games: Game[] = [];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', games],
      ['B', games],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const gameResults = new Map<string, string>();

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.55, sos: 0.60 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.55, sos: 0.58 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('division: restarts from step 1 after elimination (NFL restart rule)', () => {
    // 3-team tie where division record eliminates C, then A/B are re-compared from H2H.
    const A = makeTeam('A');
    const B = makeTeam('B');
    const C = makeTeam('C');

    const games: Game[] = [makeGame('ab1', 'A', 'B')];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', [games[0]]],
      ['B', [games[0]]],
      ['C', []],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
      ['C', []],
    ]);
    const gameResults = new Map<string, string>([['ab1', 'B']]); // B beats A head-to-head

    // All tied overall record. Division record best are A/B, C worst -> C eliminated by step 2.
    // After elimination, restart step 1 between A/B and B should win due to H2H.
    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['C', makeStats({ wins: 10, losses: 7, divWins: 3, divLosses: 3, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, B, C], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('B');
    expect(sorted[2].id).toBe('C');
  });

  it('division: 3+ team H2H only applies as a sweep (sweeper wins)', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');
    const C = makeTeam('C');

    const games: Game[] = [
      makeGame('ab', 'A', 'B'),
      makeGame('ac', 'A', 'C'),
      makeGame('bc', 'B', 'C'),
    ];
    const teamGamesMap = new Map<string, Game[]>();
    [A, B, C].forEach(t => teamGamesMap.set(t.id, []));
    for (const g of games) {
      teamGamesMap.get(g.homeTeamId)!.push(g);
      teamGamesMap.get(g.awayTeamId)!.push(g);
    }

    const opponentsMap = new Map<string, string[]>([
      ['A', ['B', 'C']],
      ['B', ['A', 'C']],
      ['C', ['A', 'B']],
    ]);
    const gameResults = new Map<string, string>([
      ['ab', 'A'],
      ['ac', 'A'], // A sweeps
      ['bc', 'B'],
    ]);
    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['C', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, B, C], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('division: 3+ team H2H only applies as a sweep (a swept team is eliminated)', () => {
    // A beats B and C, B beats C -> C is swept by A and B -> eliminated at H2H step
    const A = makeTeam('A');
    const B = makeTeam('B');
    const C = makeTeam('C');

    const games: Game[] = [
      makeGame('ab', 'A', 'B'),
      makeGame('ac', 'A', 'C'),
      makeGame('bc', 'B', 'C'),
    ];
    const teamGamesMap = new Map<string, Game[]>();
    [A, B, C].forEach(t => teamGamesMap.set(t.id, []));
    for (const g of games) {
      teamGamesMap.get(g.homeTeamId)!.push(g);
      teamGamesMap.get(g.awayTeamId)!.push(g);
    }

    const opponentsMap = new Map<string, string[]>([
      ['A', ['B', 'C']],
      ['B', ['A', 'C']],
      ['C', ['A', 'B']],
    ]);
    const gameResults = new Map<string, string>([
      ['ab', 'A'],
      ['ac', 'A'],
      ['bc', 'B'],
    ]);
    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['C', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, B, C], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[2].id).toBe('C');
  });

  it('wildcard: 3+ team H2H only applies as a sweep (winner sweeps)', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');
    const C = makeTeam('C');

    const games: Game[] = [
      makeGame('ab', 'A', 'B'),
      makeGame('ac', 'A', 'C'),
      makeGame('bc', 'B', 'C'),
    ];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', [games[0], games[1]]],
      ['B', [games[0], games[2]]],
      ['C', [games[1], games[2]]],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', ['B', 'C']],
      ['B', ['A', 'C']],
      ['C', ['A', 'B']],
    ]);
    const gameResults = new Map<string, string>([
      ['ab', 'A'],
      ['ac', 'A'],
      ['bc', 'B'],
    ]);

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['C', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, B, C], statsMap, games, gameResults, 'wildcard', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('wildcard: does not eliminate anyone at H2H step if no sweep exists', () => {
    // No sweeps; conference record should decide.
    const A = makeTeam('A');
    const B = makeTeam('B');
    const C = makeTeam('C');

    const games: Game[] = [
      makeGame('ab', 'A', 'B'), // A beats B
      makeGame('bc', 'B', 'C'), // B beats C
      makeGame('ca', 'C', 'A'), // C beats A
    ];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', [games[0], games[2]]],
      ['B', [games[0], games[1]]],
      ['C', [games[1], games[2]]],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', ['B', 'C']],
      ['B', ['A', 'C']],
      ['C', ['B', 'A']],
    ]);
    const gameResults = new Map<string, string>([
      ['ab', 'A'],
      ['bc', 'B'],
      ['ca', 'C'],
    ]);

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, confWins: 8, confLosses: 4, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['C', makeStats({ wins: 10, losses: 7, confWins: 6, confLosses: 6, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, B, C], statsMap, games, gameResults, 'wildcard', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
    expect(sorted[2].id).toBe('C');
  });

  it('wildcard: head-to-head decides (2 teams)', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');
    // Put them in different divisions so wildcard pre-step does not eliminate anyone.
    A.division = 'East';
    B.division = 'West';

    const games: Game[] = [makeGame('ab', 'A', 'B')];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', [games[0]]],
      ['B', [games[0]]],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    const gameResults = new Map<string, string>([['ab', 'A']]);

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5 })],
      ['B', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'wildcard', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('wildcard: conference record decides when H2H not applicable', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');
    A.division = 'East';
    B.division = 'West';

    const games: Game[] = [];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', []],
      ['B', []],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const gameResults = new Map<string, string>();

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, confWins: 8, confLosses: 4, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'wildcard', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('wildcard: common games decides (minimum 4 common games)', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');
    const X = makeTeam('X');
    const Y = makeTeam('Y');
    A.division = 'East';
    B.division = 'West';

    const games: Game[] = [
      // Common games: 2 opponents played twice => 4 common games
      makeGame('ax1', 'A', 'X'),
      makeGame('xa2', 'X', 'A'),
      makeGame('ay1', 'A', 'Y'),
      makeGame('ya2', 'Y', 'A'),
      makeGame('bx1', 'B', 'X'),
      makeGame('xb2', 'X', 'B'),
      makeGame('by1', 'B', 'Y'),
      makeGame('yb2', 'Y', 'B'),
    ];

    const teamGamesMap = new Map<string, Game[]>();
    [A, B, X, Y].forEach(t => teamGamesMap.set(t.id, []));
    for (const g of games) {
      teamGamesMap.get(g.homeTeamId)!.push(g);
      teamGamesMap.get(g.awayTeamId)!.push(g);
    }

    const opponentsMap = new Map<string, string[]>();
    opponentsMap.set('A', ['X', 'X', 'Y', 'Y']);
    opponentsMap.set('B', ['X', 'X', 'Y', 'Y']);

    const gameResults = new Map<string, string>([
      // A wins all, B loses all
      ['ax1', 'A'],
      ['xa2', 'A'],
      ['ay1', 'A'],
      ['ya2', 'A'],
      ['bx1', 'X'],
      ['xb2', 'X'],
      ['by1', 'Y'],
      ['yb2', 'Y'],
    ]);

    const statsMap: TeamStatsMap = new Map([
      // Keep conference record and strength metrics tied so common games decides.
      ['A', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'wildcard', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('wildcard: SOV decides when earlier steps tie', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');
    A.division = 'East';
    B.division = 'West';

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.61, sos: 0.55 })],
      ['B', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.60, sos: 0.99 })],
    ]);
    const games: Game[] = [];
    const opponentsMap = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const teamGamesMap = new Map<string, Game[]>([
      ['A', []],
      ['B', []],
    ]);
    const gameResults = new Map<string, string>();

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'wildcard', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('wildcard: SOS decides when SOV ties', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');
    A.division = 'East';
    B.division = 'West';

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.60, sos: 0.61 })],
      ['B', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.60, sos: 0.60 })],
    ]);
    const games: Game[] = [];
    const opponentsMap = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const teamGamesMap = new Map<string, Game[]>([
      ['A', []],
      ['B', []],
    ]);
    const gameResults = new Map<string, string>();

    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'wildcard', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A');
  });

  it('wildcard: pre-step takes best team per division, then re-enters when that team is removed', () => {
    // Two divisions:
    // - East: A and A2 tied, but A wins division tiebreaker.
    // - West: B is present.
    //
    // For the first winner, wildcard pre-step should consider A and B (not A2).
    // After A is removed, the next comparison should elevate A2 as East representative.
    const A = makeTeam('A'); A.division = 'East';
    const A2 = makeTeam('A2'); A2.division = 'East';
    const B = makeTeam('B'); B.division = 'West';

    const games: Game[] = [makeGame('aa2', 'A', 'A2')];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', [games[0]]],
      ['A2', [games[0]]],
      ['B', []],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', ['A2']],
      ['A2', ['A']],
      ['B', []],
    ]);
    const gameResults = new Map<string, string>([['aa2', 'A']]); // A beats A2 in division tiebreak

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['A2', makeStats({ wins: 10, losses: 7, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, confWins: 6, confLosses: 6, sov: 0.5, sos: 0.5 })],
    ]);

    const sorted = sortTeams([A, A2, B], statsMap, games, gameResults, 'wildcard', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('A'); // East representative first
    expect(sorted[1].id).toBe('A2'); // then East re-enters after A is removed
  });

  it('coin toss is the final fallback when everything ties', () => {
    const A = makeTeam('A');
    const B = makeTeam('B');

    const games: Game[] = [];
    const teamGamesMap = new Map<string, Game[]>([
      ['A', games],
      ['B', games],
    ]);
    const opponentsMap = new Map<string, string[]>([
      ['A', []],
      ['B', []],
    ]);
    const gameResults = new Map<string, string>();

    const statsMap: TeamStatsMap = new Map([
      ['A', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
      ['B', makeStats({ wins: 10, losses: 7, divWins: 4, divLosses: 2, confWins: 7, confLosses: 5, sov: 0.5, sos: 0.5 })],
    ]);

    vi.spyOn(Math, 'random').mockReturnValue(0.99); // pick index 1
    const sorted = sortTeams([A, B], statsMap, games, gameResults, 'division', opponentsMap, teamGamesMap);
    expect(sorted[0].id).toBe('B');
  });
});


