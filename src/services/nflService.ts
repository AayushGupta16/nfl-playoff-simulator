import axios from 'axios';
import type { Team, Game } from '../types';

const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const TEAM_DIVISION_MAP: Record<string, { conference: string, division: string }> = {
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

export const fetchStandings = async (): Promise<Team[]> => {
  try {
    const response = await axios.get(`https://site.api.espn.com/apis/v2/sports/football/nfl/standings`);
    const teams: Team[] = [];

    const processEntry = (entry: any) => {
        const teamData = entry.team;
        const stats = entry.stats;
        
        const getStat = (name: string, type?: string) => {
            return stats.find((s: any) => s.name === name || s.type === type)?.value || 0;
        };

        const wins = getStat('wins', 'wins');
        const losses = getStat('losses', 'losses');
        const ties = getStat('ties', 'ties');
        
        // Division and Conference records are available as direct numeric fields
        const divisionWins = getStat('divisionWins');
        const divisionLosses = getStat('divisionLosses');
        const divisionTies = getStat('divisionTies');
        
        // For conference record, we need to parse from displayValue
        // The field with displayName 'CONF' has the record as a string like "6-2"
        const parseRecord = (recStr: string) => {
            if (!recStr) return { w: 0, l: 0, t: 0 };
            const parts = recStr.split('-');
            return {
                w: parseInt(parts[0]) || 0,
                l: parseInt(parts[1]) || 0,
                t: parseInt(parts[2]) || 0
            };
        };

        const confStat = stats.find((s: any) => s.displayName === 'CONF');
        const confRec = confStat ? parseRecord(confStat.displayValue) : { w: 0, l: 0, t: 0 };

        const abbr = teamData.abbreviation;
        const mapping = TEAM_DIVISION_MAP[abbr];

        teams.push({
            id: teamData.id,
            name: teamData.displayName,
            abbreviation: abbr,
            wins,
            losses,
            ties,
            divisionWins,
            divisionLosses,
            divisionTies,
            conferenceWins: confRec.w,
            conferenceLosses: confRec.l,
            conferenceTies: confRec.t,
            conference: mapping?.conference || 'Unknown',
            division: mapping?.division || 'Unknown',
            logo: teamData.logos?.[0]?.href
        });
    };

    const traverse = (node: any) => {
        if (node.standings && node.standings.entries) {
            node.standings.entries.forEach(processEntry);
        }
        if (node.children) {
            node.children.forEach(traverse);
        }
    };

    if (response.data) {
        traverse(response.data);
    }
    
    return teams;
  } catch (error) {
    console.error("Error fetching standings:", error);
    return [];
  }
};

export const fetchSchedule = async (): Promise<{ games: Game[], currentWeek: number }> => {
    try {
        // 1. Get current week info (and season year)
        const currentScoreboard = await axios.get(`${BASE_URL}/scoreboard`);
        const currentWeek = currentScoreboard.data.week?.number || 1;
        const seasonYear = currentScoreboard.data.season?.year || 2024;

        // 2. Get full season schedule (approx Sep 1 to Jan 20)
        // We use a wide date range to capture the entire regular season
        const startDate = `${seasonYear}0901`;
        const endDate = `${seasonYear + 1}0120`;
        
        const response = await axios.get(`${BASE_URL}/scoreboard?limit=1000&dates=${startDate}-${endDate}`);
        
        const games: Game[] = [];
        const events = response.data.events || [];
        
        events.forEach((evt: any) => {
            const competition = evt.competitions[0];
            const homeComp = competition.competitors.find((c: any) => c.homeAway === 'home');
            const awayComp = competition.competitors.find((c: any) => c.homeAway === 'away');
            const isFinished = evt.status.type.completed;
            const weekNum = evt.week?.number;

            // Skip if no week number (e.g. preseason games that might slip in, though dates should handle it)
            if (!weekNum) return;
            
            // Skip TBD games or placeholder teams (ID -1)
            if (homeComp.team.id === '-1' || awayComp.team.id === '-1' || 
                homeComp.team.displayName.includes('TBD') || awayComp.team.displayName.includes('TBD')) {
                return;
            }
            
            // Parse scores (for 538-style margin of victory Elo)
            const homeScore = parseInt(homeComp.score) || 0;
            const awayScore = parseInt(awayComp.score) || 0;
            
            // Parse winner
            let winnerId: string | undefined = undefined;
            if (isFinished) {
                if (homeComp.winner === true) winnerId = homeComp.team.id;
                else if (awayComp.winner === true) winnerId = awayComp.team.id;
                else {
                    if (homeScore > awayScore) winnerId = homeComp.team.id;
                    else if (awayScore > homeScore) winnerId = awayComp.team.id;
                    else winnerId = 'TIE';
                }
            }

            games.push({
                id: evt.id,
                week: weekNum,
                homeTeamId: homeComp.team.id,
                awayTeamId: awayComp.team.id,
                homeTeamName: homeComp.team.displayName,
                awayTeamName: awayComp.team.displayName,
                isFinished: isFinished,
                winnerId: winnerId,
                // Default to 0.5; actual odds come from Kalshi or Elo
                homeWinProb: 0.5,
                date: evt.date,
                // Scores for 538-style Elo with margin of victory
                homeScore: isFinished ? homeScore : undefined,
                awayScore: isFinished ? awayScore : undefined
            });
        });
        
        return { games, currentWeek };

    } catch (error) {
        console.error("Error fetching schedule:", error);
        return { games: [], currentWeek: 1 };
    }
};
