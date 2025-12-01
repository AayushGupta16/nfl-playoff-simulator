export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  wins: number;
  losses: number;
  ties: number;
  
  // Tie-breaker stats
  divisionWins: number;
  divisionLosses: number;
  divisionTies: number;
  
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;

  conference: string;
  division: string;
  logo?: string;
  
  // Simulation Mutable
  simWins?: number;
  simLosses?: number;
  simTies?: number;
  simDivisionWins?: number;
  simDivisionLosses?: number;
  simDivisionTies?: number;
  simConferenceWins?: number;
  simConferenceLosses?: number;
  simConferenceTies?: number;
}

export interface Game {
  id: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeWinProb: number; // 0 to 1
  isFinished: boolean;
  winnerId?: string;
  date: string; // ISO Date string
  
  // Score data (for 538-style Elo with margin of victory)
  homeScore?: number;
  awayScore?: number;
}

/** Team Elo data for 538-style simulation */
export interface TeamEloData {
  teamId: string;
  elo: number;
  preseasonElo: number;
  expectedWins: number;
}

export interface SimulationResult {
  teamId: string;
  teamName: string;
  madePlayoffs: number;
  wonDivision: number; // New
  madeWildcard: number; // New
  wonFirstSeed: number; // New (1st Round Bye)
  totalSimulations: number;
  playoffProb: number;
  divisionProb: number; // New
  wildcardProb: number; // New
  firstSeedProb: number; // New
}
