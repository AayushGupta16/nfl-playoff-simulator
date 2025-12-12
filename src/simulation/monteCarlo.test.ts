import { describe, it, expect, afterEach } from 'vitest';
import { runSimulation, eloDiffToWinProb, winProbToEloDiff } from './monteCarlo';
import type { Team, Game } from '../types';
import { vi } from 'vitest';

// Mock Data Helpers
const createMockTeam = (id: string, name: string): Team => ({
    id, name, abbreviation: id,
    wins: 0, losses: 0, ties: 0,
    divisionWins: 0, divisionLosses: 0, divisionTies: 0,
    conferenceWins: 0, conferenceLosses: 0, conferenceTies: 0,
    conference: 'NFC', division: 'North'
});

const createMockGame = (id: string, week: number, home: string, away: string, marketProb?: number): Game => ({
    id, week, 
    homeTeamId: home, awayTeamId: away, 
    homeTeamName: home, awayTeamName: away,
    homeWinProb: marketProb ?? 0.5,
    isFinished: false,
    date: '2024-01-01'
});

describe('Monte Carlo Simulation Logic', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    it('should correctly convert Elo diff to probability and back (inverse functions)', () => {
        const eloDiff = 300;
        const prob = eloDiffToWinProb(eloDiff);
        const recoveredDiff = winProbToEloDiff(prob);
        
        expect(recoveredDiff).toBeCloseTo(eloDiff, 0.1);
    });

    it('should show momentum effect: user pick in Week 1 affects Week 2 Elo', () => {
        const teams = [
            createMockTeam('CHI', 'Bears'),
            createMockTeam('GB', 'Packers'),
            createMockTeam('CLE', 'Browns')
        ];

        // Week 1: CHI vs GB, Week 2: CLE vs CHI
        const games = [
            createMockGame('g1', 1, 'GB', 'CHI', 0.5),
            createMockGame('g2', 2, 'CLE', 'CHI', 0.5) 
        ];

        const kalshiElo = new Map(teams.map(t => [t.id, 1500] as const));

        // Make the test deterministic by controlling RNG:
        // - Baseline consumes RNG for Week 1 then Week 2.
        // - Momentum consumes RNG only for Week 2 (Week 1 is user-picked).
        //
        // Choose values so Week 1 baseline results in CHI losing (Elo down),
        // and Week 2 RNG sits between the baseline and momentum home-win thresholds.
        const randSpy = vi.spyOn(Math, 'random');
        randSpy
          .mockImplementationOnce(() => 0.10) // baseline Week 1: GB (home) wins
          .mockImplementationOnce(() => 0.57) // baseline Week 2 RNG
          // Any additional randomness (e.g. coin-toss tiebreakers) should be stable and defined
          .mockImplementation(() => 0.42);

        const baseline = runSimulation(teams, games, 1, new Map(), kalshiElo);
        const baselineChiWinProb = 1 - (baseline.simulatedOdds.get('g2') ?? 0);

        randSpy.mockReset();
        randSpy
          .mockImplementationOnce(() => 0.57) // momentum Week 2 RNG (same as baseline Week 2)
          .mockImplementation(() => 0.42);

        const userPicks = new Map([['g1', 'CHI']]); // Week 1 CHI win -> Elo up
        const momentum = runSimulation(teams, games, 1, new Map(), kalshiElo, userPicks);
        const momentumChiWinProb = 1 - (momentum.simulatedOdds.get('g2') ?? 0);

        expect(momentumChiWinProb).toBeGreaterThan(baselineChiWinProb);
    });

    it('should use market odds when available (not pure Elo)', () => {
        const teams = [
            createMockTeam('CHI', 'Bears'),
            createMockTeam('GB', 'Packers'),
            createMockTeam('CLE', 'Browns')
        ];

        const games = [
            createMockGame('g1', 1, 'GB', 'CHI', 0.5),
            createMockGame('g2', 2, 'CLE', 'CHI', 0.5) 
        ];

        // Market says CLE (Home) has 15% → CHI (Away) has 85%
        const marketOdds = new Map([['g2', 0.15]]); 
        
        const userPicks = new Map([['g1', 'CHI']]);
        const kalshiElo = new Map(teams.map(t => [t.id, 1500] as const));
        const result = runSimulation(teams, games, 1000, marketOdds, kalshiElo, userPicks);
        
        const chiWinProb = 1 - (result.simulatedOdds.get('g2') ?? 0);

        // Should respect market odds (~85% for CHI) rather than 50% Elo baseline
        expect(chiWinProb).toBeGreaterThan(0.80);
    });
});

