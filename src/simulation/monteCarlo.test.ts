import { describe, it, expect } from 'vitest';
import { runSimulation, eloDiffToWinProb, winProbToEloDiff } from './monteCarlo';
import type { Team, Game } from '../types';

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

        // Baseline: No picks (random outcomes)
        const baseline = runSimulation(teams, games, 1000, new Map(), new Map());
        const baselineChiWinProb = 1 - (baseline.simulatedOdds.get('g2') ?? 0); 
        
        // Scenario: User picks CHI to win Week 1 (always wins → Elo boost)
        const userPicks = new Map([['g1', 'CHI']]);
        const momentum = runSimulation(teams, games, 1000, new Map(), new Map(), userPicks);
        const momentumChiWinProb = 1 - (momentum.simulatedOdds.get('g2') ?? 0);

        // CHI win prob should increase due to Elo gain from Week 1 win
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
        const result = runSimulation(teams, games, 1000, marketOdds, new Map(), userPicks);
        
        const chiWinProb = 1 - (result.simulatedOdds.get('g2') ?? 0);

        // Should respect market odds (~85% for CHI) rather than 50% Elo baseline
        expect(chiWinProb).toBeGreaterThan(0.80);
    });
});

