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
  contextTeamId?: string; // If provided, this team will always appear on the left
}

export const GameCard: React.FC<Props> = ({ game, homeTeam, awayTeam, prob, userPick, onPick, contextTeamId }) => {
  const homeProbPct = Math.round(prob * 100);
  const awayProbPct = 100 - homeProbPct;
  
  const isHomePicked = userPick === game.homeTeamId;
  const isAwayPicked = userPick === game.awayTeamId;

  // Determine if we need to swap display order (context team should be on left)
  const contextIsHome = contextTeamId === game.homeTeamId;
  const shouldSwap = contextTeamId && contextIsHome;

  // Define left/right based on context
  const leftTeam = shouldSwap ? homeTeam : awayTeam;
  const rightTeam = shouldSwap ? awayTeam : homeTeam;
  const leftTeamName = shouldSwap ? game.homeTeamName : game.awayTeamName;
  const rightTeamName = shouldSwap ? game.awayTeamName : game.homeTeamName;
  const leftTeamId = shouldSwap ? game.homeTeamId : game.awayTeamId;
  const rightTeamId = shouldSwap ? game.awayTeamId : game.homeTeamId;
  const isLeftPicked = shouldSwap ? isHomePicked : isAwayPicked;
  const isRightPicked = shouldSwap ? isAwayPicked : isHomePicked;
  const leftProbPct = shouldSwap ? homeProbPct : awayProbPct;
  const rightProbPct = shouldSwap ? awayProbPct : homeProbPct;
  const leftIsHome = shouldSwap ? true : false;
  const rightIsHome = shouldSwap ? false : true;
  
  return (
    <div className="flex items-center justify-between py-3 px-2 border-b border-slate-100 hover:bg-slate-50 transition-colors group text-sm">
        
        {/* Left Team Section */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
            <TeamIcon url={leftTeam?.logo} name={leftTeamName} size="sm" />
            <div className="flex flex-col min-w-0">
                <span className={cn("font-medium truncate", isLeftPicked ? "text-slate-900 font-bold" : "text-slate-600")}>
                    {leftTeamName}
                </span>
                {contextTeamId && (
                    <span className={cn(
                        "text-[9px] uppercase font-bold tracking-wide",
                        leftIsHome ? "text-blue-500" : "text-orange-500"
                    )}>
                        {leftIsHome ? "Home" : "Away"}
                    </span>
                )}
            </div>
        </div>

        {/* Interaction Area */}
        <div className="flex items-center gap-2 mx-2 shrink-0">
             {/* Left Checkbox */}
            <button
                onClick={() => onPick(game.id, isLeftPicked ? null : leftTeamId)}
                className={cn(
                    "w-6 h-6 rounded border flex items-center justify-center transition-all",
                    isLeftPicked 
                        ? "bg-slate-800 border-slate-800 text-white" 
                        : "bg-white border-slate-300 hover:border-slate-400 text-transparent"
                )}
                aria-label={`Pick ${leftTeamName}`}
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </button>

            {/* Probability Visualization (Split Dot/Bar) */}
            <div className="flex flex-col items-center w-12 gap-0.5">
                <div className="flex w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className={cn("h-full", leftIsHome ? "bg-blue-600" : "bg-orange-400")} style={{ width: `${leftProbPct}%` }} />
                    <div className={cn("h-full", rightIsHome ? "bg-blue-600" : "bg-orange-400")} style={{ width: `${rightProbPct}%` }} />
                </div>
                <div className="flex justify-between w-full text-[10px] text-slate-400 font-mono leading-none">
                    <span>{leftProbPct}</span>
                    <span>{rightProbPct}</span>
                </div>
            </div>

            {/* Right Checkbox */}
            <button
                onClick={() => onPick(game.id, isRightPicked ? null : rightTeamId)}
                className={cn(
                    "w-6 h-6 rounded border flex items-center justify-center transition-all",
                    isRightPicked 
                        ? "bg-slate-800 border-slate-800 text-white" 
                        : "bg-white border-slate-300 hover:border-slate-400 text-transparent"
                )}
                aria-label={`Pick ${rightTeamName}`}
            >
                 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </button>
        </div>

        {/* Right Team Section */}
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <div className="flex flex-col items-end min-w-0">
                <span className={cn("font-medium truncate text-right", isRightPicked ? "text-slate-900 font-bold" : "text-slate-600")}>
                    {rightTeamName}
                </span>
                {contextTeamId && (
                    <span className={cn(
                        "text-[9px] uppercase font-bold tracking-wide",
                        rightIsHome ? "text-blue-500" : "text-orange-500"
                    )}>
                        {rightIsHome ? "Home" : "Away"}
                    </span>
                )}
            </div>
            <TeamIcon url={rightTeam?.logo} name={rightTeamName} size="sm" />
        </div>
    </div>
  );
};
