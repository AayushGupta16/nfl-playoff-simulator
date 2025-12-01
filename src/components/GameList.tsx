import React, { useMemo } from 'react';
import type { Game, Team } from '../types';
import { GameCard } from './GameCard';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
    games: Game[];
    teams: Team[]; // Need teams for logos
    odds: Map<string, number>; // Static market odds
    simulatedOdds?: Map<string, number>; // Dynamic odds from simulation
    userPicks: Map<string, string>;
    onPick: (gameId: string, winnerId: string | null) => void;
    onReset: () => void;
    hasPicks: boolean;
}

export const GameList: React.FC<Props> = ({ games, teams, odds, simulatedOdds, userPicks, onPick, onReset, hasPicks }) => {
    // Create Team Map for quick lookup
    const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

    // Filter for remaining games only
    const remainingGames = useMemo(() => games.filter(g => !g.isFinished), [games]);

    // Group by week
    const gamesByWeek = useMemo(() => {
        const groups: Record<number, Game[]> = {};
        remainingGames.forEach(g => {
            if (!groups[g.week]) groups[g.week] = [];
            groups[g.week].push(g);
        });
        return groups;
    }, [remainingGames]);

    const weeks = Object.keys(gamesByWeek).map(Number).sort((a, b) => a - b);

    if (remainingGames.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <CalendarDays className="w-12 h-12 mb-2 opacity-20" />
                <p>No remaining games</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white rounded-none sm:rounded-xl border border-slate-200 shadow-sm">
            <div className="flex-none p-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    Schedule
                </h2>
                
                <button
                    onClick={onReset}
                    disabled={!hasPicks}
                    className={clsx(
                        "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-all",
                        hasPicks 
                            ? "text-blue-600 hover:bg-blue-50 hover:text-blue-700" 
                            : "text-slate-300 cursor-not-allowed"
                    )}
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Picks
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                {weeks.map(week => (
                    <div key={week}>
                        <div className="sticky top-0 z-10 bg-slate-100 py-1 px-4 border-y border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                            Week {week}
                        </div>
                        <div className="px-2">
                            {gamesByWeek[week].map(game => {
                                // Use simulated odds if available (dynamic), otherwise static market odds
                                const prob = simulatedOdds?.get(game.id) ?? odds.get(game.id) ?? game.homeWinProb ?? 0.5;
                                return (
                                    <GameCard
                                        key={game.id}
                                        game={game}
                                        homeTeam={teamMap.get(game.homeTeamId)}
                                        awayTeam={teamMap.get(game.awayTeamId)}
                                        prob={prob}
                                        userPick={userPicks.get(game.id)}
                                        onPick={onPick}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
