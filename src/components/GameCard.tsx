import React from 'react';
import type { Game, Team } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TeamIcon } from './TeamLogo';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Props {
  game: Game;
  homeTeam?: Team;
  awayTeam?: Team;
  prob: number; // 0-1, home win prob
  userPick: string | undefined; // teamId
  onPick: (gameId: string, winnerId: string | null) => void;
}

export const GameCard: React.FC<Props> = ({ game, homeTeam, awayTeam, prob, userPick, onPick }) => {
  const homeProbPct = Math.round(prob * 100);
  const awayProbPct = 100 - homeProbPct;
  
  const isHomePicked = userPick === game.homeTeamId;
  const isAwayPicked = userPick === game.awayTeamId;

  // 538 Style: Compact table-like row
  // [Date] [Away Logo] [Away Name] [Checkbox] [Prob Bar] [Checkbox] [Home Name] [Home Logo]
  // Actually 538 uses a list of games where you check the winner box.
  
  return (
    <div className="flex items-center justify-between py-2 px-1 border-b border-slate-100 hover:bg-slate-50 transition-colors group text-sm">
        
        {/* Away Team Section */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
            <TeamIcon url={awayTeam?.logo} name={game.awayTeamName} size="sm" />
            <span className={cn("font-medium truncate", isAwayPicked ? "text-slate-900 font-bold" : "text-slate-600")}>
                {game.awayTeamName}
            </span>
        </div>

        {/* Interaction Area */}
        <div className="flex items-center gap-2 mx-2 shrink-0">
             {/* Away Checkbox */}
            <button
                onClick={() => onPick(game.id, isAwayPicked ? null : game.awayTeamId)}
                className={cn(
                    "w-5 h-5 rounded border flex items-center justify-center transition-all",
                    isAwayPicked 
                        ? "bg-slate-800 border-slate-800 text-white" 
                        : "bg-white border-slate-300 hover:border-slate-400 text-transparent"
                )}
                aria-label={`Pick ${game.awayTeamName}`}
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </button>

            {/* Probability Visualization (Split Dot/Bar) */}
            <div className="flex flex-col items-center w-12 gap-0.5">
                <div className="flex w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="bg-orange-400 h-full" style={{ width: `${awayProbPct}%` }} />
                    <div className="bg-blue-600 h-full" style={{ width: `${homeProbPct}%` }} />
                </div>
                <div className="flex justify-between w-full text-[10px] text-slate-400 font-mono leading-none">
                    <span>{awayProbPct}</span>
                    <span>{homeProbPct}</span>
                </div>
            </div>

            {/* Home Checkbox */}
            <button
                onClick={() => onPick(game.id, isHomePicked ? null : game.homeTeamId)}
                className={cn(
                    "w-5 h-5 rounded border flex items-center justify-center transition-all",
                    isHomePicked 
                        ? "bg-slate-800 border-slate-800 text-white" 
                        : "bg-white border-slate-300 hover:border-slate-400 text-transparent"
                )}
                aria-label={`Pick ${game.homeTeamName}`}
            >
                 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </button>
        </div>

        {/* Home Team Section */}
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <span className={cn("font-medium truncate text-right", isHomePicked ? "text-slate-900 font-bold" : "text-slate-600")}>
                {game.homeTeamName}
            </span>
            <TeamIcon url={homeTeam?.logo} name={game.homeTeamName} size="sm" />
        </div>
    </div>
  );
};
