import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SimulationResult, Team, Game } from '../types';
import { clsx } from 'clsx';
import { TeamIcon } from './TeamLogo';
import { GameCard } from './GameCard';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  results: SimulationResult[];
  teams: Team[]; // For logos
  simDuration?: number | null;
  marketPlayoffOdds?: Map<string, number>;
  games: Game[];
  odds: Map<string, number>;
  simulatedOdds?: Map<string, number>;
  userPicks: Map<string, string>;
  onPick: (gameId: string, winnerId: string | null) => void;
}

type SortField = 'name' | 'prob' | 'div' | 'seed1' | 'wc';

export const Results: React.FC<Props> = ({ 
    results, 
    teams, 
    simDuration, 
    marketPlayoffOdds,
    games,
    odds,
    simulatedOdds,
    userPicks,
    onPick
}) => {
  const [sortField, setSortField] = useState<SortField>('prob');
  const [sortDesc, setSortDesc] = useState(true);
  const [conferenceFilter, setConferenceFilter] = useState<'ALL' | 'AFC' | 'NFC'>('ALL');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);
  const expandedRowRef = useRef<HTMLTableRowElement | null>(null);
  const prevResultsRef = useRef<SimulationResult[] | null>(null);

  // If a team is expanded (focus mode) and new results come in (after a pick),
  // keep that team in view even if sorting causes the row to move.
  useEffect(() => {
    const prev = prevResultsRef.current;
    prevResultsRef.current = results;

    if (!expandedTeamId) return;
    if (!prev) return; // initial render
    if (prev === results) return;

    const row = expandedRowRef.current;
    if (!row) return;

    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [results, expandedTeamId]);

  // Filter by Conference
  const filteredResults = useMemo(() => {
      if (conferenceFilter === 'ALL') return results;
      return results.filter(res => {
          const team = teamMap.get(res.teamId);
          return team?.conference === conferenceFilter;
      });
  }, [results, conferenceFilter, teamMap]);

  const sortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      let valA: number | string = '';
      let valB: number | string = '';

      switch (sortField) {
        case 'name':
          valA = a.teamName;
          valB = b.teamName;
          break;
        case 'prob':
          valA = a.playoffProb;
          valB = b.playoffProb;
          break;
        case 'div':
          valA = a.divisionProb;
          valB = b.divisionProb;
          break;
        case 'seed1':
          valA = a.firstSeedProb;
          valB = b.firstSeedProb;
          break;
        case 'wc':
          valA = a.wildcardProb;
          valB = b.wildcardProb;
          break;
      }

      if (valA < valB) return sortDesc ? 1 : -1;
      if (valA > valB) return sortDesc ? -1 : 1;
      return 0;
    });
  }, [filteredResults, sortField, sortDesc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(true); // Default desc
    }
  };

  const toggleTeamExpansion = (teamId: string) => {
    setExpandedTeamId(prev => prev === teamId ? null : teamId);
  };

  if (results.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            Playoff Chances
            </h2>
            <div className="flex bg-slate-200 rounded-md p-0.5 ml-4">
                {['ALL', 'AFC', 'NFC'].map((conf) => (
                    <button
                        key={conf}
                        onClick={() => setConferenceFilter(conf as any)}
                        className={clsx(
                            "px-3 py-0.5 text-[10px] font-bold rounded-sm transition-all",
                            conferenceFilter === conf
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        {conf}
                    </button>
                ))}
            </div>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          {results[0]?.totalSimulations.toLocaleString()} SIMS
          {simDuration && (
             <span className="ml-2 opacity-60">
                IN {(simDuration / 1000).toFixed(2)}s
             </span>
          )}
        </span>
      </div>

      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-[10px] text-slate-400 uppercase bg-white border-b border-slate-100 sticky top-0 z-10 font-bold tracking-wider">
            <tr>
              <th className="px-4 py-2 cursor-pointer hover:bg-slate-50 min-w-[140px] sm:w-48" onClick={() => handleSort('name')}>
                Team
              </th>
              <th className="px-2 py-2 text-right cursor-pointer hover:bg-slate-50 hidden sm:table-cell w-20" onClick={() => handleSort('div')}>
                Win Div
              </th>
              <th className="px-2 py-2 text-right cursor-pointer hover:bg-slate-50 hidden sm:table-cell w-20" onClick={() => handleSort('wc')}>
                Wildcard
              </th>
              <th className="px-2 py-2 text-right cursor-pointer hover:bg-slate-50 hidden sm:table-cell w-20" onClick={() => handleSort('seed1')}>
                1st Seed
              </th>
              {marketPlayoffOdds && marketPlayoffOdds.size > 0 && (
                <th className="px-2 py-2 text-right cursor-default hidden sm:table-cell w-24 border-l border-slate-100 bg-slate-50/30">
                    Market
                </th>
              )}
              <th className="px-4 py-2 text-right cursor-pointer hover:bg-slate-50 w-28 sm:w-32 bg-slate-50/50 border-l border-slate-100" onClick={() => handleSort('prob')}>
                Make Playoffs
              </th>
          </tr>
        </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedResults.map((res) => {
              const team = teamMap.get(res.teamId);
              const probPct = (res.playoffProb * 100).toFixed(0);
              const probVal = res.playoffProb * 100;
              
              // Helper for column cells
              const renderProbCell = (prob: number) => {
                  const val = prob * 100;
                  const pct = val.toFixed(0);
                  const display = val > 99 ? '>99' : val < 1 && val > 0 ? '<1' : pct;
                  
                  return (
                    <div className="flex justify-end">
                        <span className={clsx(
                             "font-medium tabular-nums",
                             val >= 50 ? "text-slate-900" : "text-slate-400",
                             val > 99 && "text-green-600"
                         )}>
                             {val === 0 ? '-' : `${display}%`}
                        </span>
                    </div>
                  );
              };

              return (
                <React.Fragment key={res.teamId}>
                <tr 
                    className={clsx("hover:bg-slate-50 group cursor-pointer transition-colors", expandedTeamId === res.teamId && "bg-slate-50")}
                    onClick={() => toggleTeamExpansion(res.teamId)}
                    ref={expandedTeamId === res.teamId ? expandedRowRef : null}
                >
                  <td className="px-4 py-2.5">
                     <div className="flex items-center gap-3">
                        <div className="text-slate-400">
                             {expandedTeamId === res.teamId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                        <TeamIcon url={team?.logo} name={res.teamName} size="sm" />
                        <div className="min-w-0">
                            <span className="font-bold text-slate-800 block leading-none truncate">{res.teamName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{team?.wins}-{team?.losses}</span>
                        </div>
                     </div>
                  </td>
                  
                  <td className="px-2 py-2.5 text-right hidden sm:table-cell">
                      {renderProbCell(res.divisionProb)}
                  </td>
                  <td className="px-2 py-2.5 text-right hidden sm:table-cell">
                      {renderProbCell(res.wildcardProb)}
                  </td>
                  <td className="px-2 py-2.5 text-right hidden sm:table-cell">
                      {renderProbCell(res.firstSeedProb)}
                  </td>
                  
                  {marketPlayoffOdds && marketPlayoffOdds.size > 0 && (
                    <td className="px-2 py-2.5 text-right hidden sm:table-cell border-l border-slate-100 bg-slate-50/10">
                        {(() => {
                        const marketProb =
                            marketPlayoffOdds.get(res.teamName) ??
                            marketPlayoffOdds.get(res.teamId);
                        if (marketProb === undefined) {
                            return <span className="text-slate-300">-</span>;
                        }
                        return renderProbCell(marketProb);
                        })()}
                    </td>
                  )}

                  <td className="px-4 py-2.5 text-right relative border-l border-slate-100 bg-slate-50/30">
                      <div className="flex flex-col items-end text-right">
                        <span className={clsx(
                            "font-bold tabular-nums leading-none text-sm sm:text-base",
                            probVal >= 50 ? "text-slate-900" : "text-slate-400",
                            probVal > 99 && "text-green-600"
                        )}>
                            {probVal > 99 ? '>99' : probVal < 1 && probVal > 0 ? '<1' : probPct}%
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium mt-0.5 tabular-nums">
                            {res.madePlayoffs.toLocaleString()}/{res.totalSimulations.toLocaleString()}
                        </span>
                     </div>
                  </td>
            </tr>
            {expandedTeamId === res.teamId && (
                <tr className="bg-slate-50/50">
                    <td colSpan={7} className="px-0 sm:px-4 py-2 border-b border-slate-100">
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm mx-2 sm:mx-0 my-1">
                            <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Remaining Schedule</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {(() => {
                                    const teamGames = games
                                        .filter(g => !g.isFinished && (g.homeTeamId === res.teamId || g.awayTeamId === res.teamId))
                                        .sort((a, b) => a.week - b.week);
                                    
                                    if (teamGames.length === 0) {
                                        return <div className="p-4 text-center text-slate-400 text-sm">No remaining games</div>;
                                    }

                                    return teamGames.map(game => {
                                         const prob = simulatedOdds?.get(game.id) ?? odds.get(game.id) ?? game.homeWinProb ?? 0.5;
                                         return (
                                            <div key={game.id} className="relative">
                                                <div className="absolute left-0 top-0 bottom-0 w-5 sm:w-6 bg-slate-50 border-r border-slate-100 flex items-center justify-center">
                                                    <span className="text-[10px] font-bold text-slate-400 -rotate-90 whitespace-nowrap">
                                                        W{game.week}
                                                    </span>
                                                </div>
                                                <div className="pl-5 sm:pl-6">
                                                    <GameCard
                                                        game={game}
                                                        homeTeam={teamMap.get(game.homeTeamId)}
                                                        awayTeam={teamMap.get(game.awayTeamId)}
                                                        prob={prob}
                                                        userPick={userPicks.get(game.id)}
                                                        onPick={onPick}
                                                        contextTeamId={res.teamId}
                                                    />
                                                </div>
                                            </div>
                                         );
                                    });
                                })()}
                            </div>
                        </div>
                    </td>
                </tr>
            )}
            </React.Fragment>
              );
            })}
        </tbody>
      </table>
      </div>
    </div>
  );
};
