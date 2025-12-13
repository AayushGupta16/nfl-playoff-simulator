import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchSchedule, fetchStandings } from './services/nflService';
import { fetchKalshiOdds, fetchKalshiPlayoffOdds } from './services/kalshiService';
import { applyEloOdds, createPreseasonEloMap } from './services/eloService';
import type { Team, Game, SimulationResult } from './types';
import { SimulationConfig } from './components/SimulationConfig';
import { Results } from './components/Results';
import { GameList } from './components/GameList';
import { Layout } from './components/Layout';
import { Methodology } from './components/Methodology';
import { LoadingThrobber } from './components/LoadingThrobber';
import { AlertCircle } from 'lucide-react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { clsx } from 'clsx';

// Main Simulator Component
function Simulator() {
  const [activeTab, setActiveTab] = useState<'picks' | 'results'>('results');
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  // UI odds (Kalshi + Elo fallback) for displaying schedule probabilities
  const [odds, setOdds] = useState<Map<string, number>>(new Map());
  // Pure Kalshi game-level odds used inside the simulation
  const [marketOdds, setMarketOdds] = useState<Map<string, number>>(new Map());
  const [marketPlayoffOdds, setMarketPlayoffOdds] = useState<Map<string, number>>(new Map());
  
  const [kalshiElos, setKalshiElos] = useState<Map<string, number>>(new Map());
  const [calibrationDone, setCalibrationDone] = useState(false);
  const [hasInitialRun, setHasInitialRun] = useState(false);
  const calibrationStartedRef = useRef(false);

  const [simulatedOdds, setSimulatedOdds] = useState<Map<string, number>>(new Map());
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Config State
  const [simCount, setSimCount] = useState(10000); // Default 10,000
  const [userPicks, setUserPicks] = useState<Map<string, string>>(new Map());

  // Timing State
  const [simDuration, setSimDuration] = useState<number | null>(null);
  const simStartTime = useRef<number>(0);

  // Worker Ref
  const workerRef = useRef<Worker | null>(null);
  const didLoadDataRef = useRef(false);

  useEffect(() => {
    // Initialize Worker
    workerRef.current = new Worker(new URL('./simulation/worker.ts', import.meta.url), {
        type: 'module'
    });

    workerRef.current.onmessage = (e) => {
        const { type, results, simulatedOdds, error, calibratedElos, calibrationMeta } = e.data;
        
        if (type === 'CALIBRATION_COMPLETE') {
            if (calibratedElos) {
                setKalshiElos(new Map(calibratedElos));
                setCalibrationDone(true);
                calibrationStartedRef.current = false;
                console.log('Calibration complete. New Elos applied.');
                if (calibrationMeta) {
                  const stoppedText = calibrationMeta.stoppedByThreshold ? 'YES' : 'NO';
                  const finalMaxDiffPct =
                    typeof calibrationMeta.finalMaxDiff === 'number'
                      ? (calibrationMeta.finalMaxDiff * 100).toFixed(2)
                      : 'n/a';
                  const finalRmsePct =
                    typeof calibrationMeta.finalRmse === 'number'
                      ? (calibrationMeta.finalRmse * 100).toFixed(2)
                      : 'n/a';
                  const metric = typeof calibrationMeta.metric === 'string' ? calibrationMeta.metric : 'n/a';
                  const thresholdPct =
                    typeof calibrationMeta.threshold === 'number'
                      ? (calibrationMeta.threshold * 100).toFixed(2)
                      : 'n/a';
                  console.log(
                    `Calibration meta: stoppedByThreshold=${stoppedText}, ` +
                      `roundsRun=${calibrationMeta.roundsRun}/${calibrationMeta.iterations}, ` +
                      `metric=${metric}, finalRMSE=${finalRmsePct}%, finalMaxDiff=${finalMaxDiffPct}%, threshold=${thresholdPct}%`
                  );
                }
            }
            setSimulating(false);
            // Note: Auto-run sim will be handled by the useEffect dependent on calibrationDone
            
        } else if (type === 'SUCCESS') {
            setResults(results);
            if (simulatedOdds) {
                setSimulatedOdds(new Map(simulatedOdds));
            }
            setSimDuration(performance.now() - simStartTime.current);
            setSimulating(false);
        } else if (type === 'ERROR') {
            console.error("Worker Error:", error);
            setError("Simulation failed.");
            calibrationStartedRef.current = false;
            setSimulating(false);
        }
    };

    return () => {
        workerRef.current?.terminate();
    };
  }, []);

  const loadData = useCallback(async () => {
      try {
        console.log("Fetching NFL data...");
        
        // Parallelize fetching:
        // Chain 1: Standings -> Kalshi Win Totals (Elo)
        // Chain 2: Schedule -> Kalshi Game Odds
        // Chain 3: Kalshi Playoff Odds
        
        const standingsPromise = fetchStandings();
        const schedulePromise = fetchSchedule();

        // Chain 1: Needs teams from standings
        const eloPromise = standingsPromise.then(async (fetchedTeams) => {
            if (fetchedTeams.length === 0) throw new Error("No teams found");
            console.log("Fetching Kalshi Win Totals...");
            const eloMap = await createPreseasonEloMap(fetchedTeams);
            return { teams: fetchedTeams, eloMap };
        });

        // Chain 2: Needs games from schedule
        const oddsPromise = schedulePromise.then(async ({ games: fetchedGames }) => {
            console.log("Fetching Kalshi Game Odds...");
            const kalshiOdds = await fetchKalshiOdds(fetchedGames);
            return { games: fetchedGames, kalshiOdds };
        });

        // Chain 3: Playoff Odds
        const playoffOddsPromise = fetchKalshiPlayoffOdds();

        // Wait for all chains
        const [
            { teams: fetchedTeams, eloMap },
            { games: fetchedGames, kalshiOdds },
            playoffOdds
        ] = await Promise.all([eloPromise, oddsPromise, playoffOddsPromise]);

        if (fetchedTeams.length === 0) {
          setError("Failed to load team data. Please check your connection.");
        }

        setTeams(fetchedTeams);
        setGames(fetchedGames);
        
        console.log(`Kalshi odds loaded for ${kalshiOdds.size} games`);
        console.log(`Kalshi Win Totals (Current Elo) loaded for ${eloMap.size} teams`);
        console.log(`Kalshi Playoff Odds loaded for ${playoffOdds.size} teams`);
        
        setKalshiElos(eloMap);
        
        // Remember pure Kalshi odds for simulation
        setMarketOdds(kalshiOdds);
        setMarketPlayoffOdds(playoffOdds);

        // Apply Elo-based odds as fallback for games without Kalshi odds (Week 16-18)
        const eloFallbackOdds = applyEloOdds(fetchedGames, fetchedTeams, kalshiOdds);

        // For UI, combine Kalshi odds with Elo fallback so every remaining game has a displayed probability
        const combinedOdds = new Map<string, number>(kalshiOdds);
        eloFallbackOdds.forEach((value, gameId) => {
            if (!combinedOdds.has(gameId)) {
                combinedOdds.set(gameId, value);
            }
        });

        console.log(`Combined odds (Kalshi + Elo fallback) for ${combinedOdds.size} games`);
        
        setOdds(combinedOdds);
        
      } catch (err) {
        console.error(err);
        setError("An error occurred while loading data.");
      } finally {
        setLoadingData(false);
      }
  }, []);

  useEffect(() => {
    // React 18 StrictMode runs effects twice in dev; avoid double-fetching external APIs.
    if (didLoadDataRef.current) return;
    didLoadDataRef.current = true;
    loadData();
  }, [loadData]);

  const handleRunSimulation = useCallback((count: number) => {
    if (teams.length === 0 || games.length === 0 || !workerRef.current) return;

    setSimulating(true);
    setSimDuration(null);
    simStartTime.current = performance.now();
    
    // Send data to worker
    workerRef.current.postMessage({
        action: 'SIMULATE',
        teams,
        games,
        count,
        // IMPORTANT: simulation only receives true market odds.
        // Elo-based games will use dynamic simElo for path-dependent probabilities.
        odds: Array.from(marketOdds.entries()),
        userPicks: Array.from(userPicks.entries()),
        kalshiElos: Array.from(kalshiElos.entries())
    });
  }, [teams, games, marketOdds, userPicks, kalshiElos]);

  // New auto-calibration useEffect
  useEffect(() => {
    if (loadingData) return;
    if (calibrationDone) return;
    if (!workerRef.current) return;
    if (teams.length === 0 || games.length === 0) return;
    if (calibrationStartedRef.current) return;

    if (marketPlayoffOdds.size === 0) {
        // No playoff markets → mark done, use win-total Elo only.
        setCalibrationDone(true);
        return;
    }

    console.log("Starting Elo calibration to match Kalshi playoff odds...");
    setSimulating(true);
    calibrationStartedRef.current = true;

    workerRef.current.postMessage({
        action: 'CALIBRATE',
        teams,
        games,
        count: 1000, // documented but not used except for clarity
        odds: Array.from(marketOdds.entries()),
        userPicks: Array.from(userPicks.entries()),
        kalshiElos: Array.from(kalshiElos.entries()),
        targetPlayoffOdds: Array.from(marketPlayoffOdds.entries()),
    });
  }, [loadingData, calibrationDone, teams, games, marketOdds, userPicks, kalshiElos, marketPlayoffOdds]);

  // Auto-run whenever user picks change
  useEffect(() => {
    if (loadingData) return;
    if (teams.length === 0) return;

    // If we have playoff odds, wait for calibration to complete
    if (marketPlayoffOdds.size > 0 && !calibrationDone) return;

    const timer = setTimeout(() => {
        handleRunSimulation(simCount); 
        if (!hasInitialRun) setHasInitialRun(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [userPicks, loadingData, handleRunSimulation, teams.length, simCount, calibrationDone, marketPlayoffOdds, hasInitialRun]);

  const handlePick = (gameId: string, winnerId: string | null) => {
      setUserPicks(prev => {
          const next = new Map(prev);
          if (winnerId) next.set(gameId, winnerId);
          else next.delete(gameId);
          return next;
      });
  };

  const handleResetPicks = () => {
      setUserPicks(new Map());
  };

  return (
    <Layout>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg shadow-sm mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
            <p className="font-bold">Error Loading Data</p>
            <p className="text-sm">{error}</p>
          </div>
          </div>
        )}

        {loadingData ? (
        <LoadingThrobber />
        ) : (
          <>
            {/* Mobile Tabs */}
            <div className="flex lg:hidden border-b border-slate-200 mb-4 bg-white -mx-4 px-4 sticky top-16 z-20 shadow-sm">
              <button
                onClick={() => setActiveTab('results')}
                className={clsx(
                  "flex-1 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors",
                  activeTab === 'results'
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                Results
              </button>
              <button
                onClick={() => setActiveTab('picks')}
                className={clsx(
                  "flex-1 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors",
                  activeTab === 'picks'
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                Make Picks
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start lg:h-[calc(100vh-8rem)]">
            
            {/* Left Column: Schedule (Scrollable) */}
            <div className={clsx(
                "lg:col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col",
                activeTab === 'results' ? "hidden lg:flex h-full" : "flex h-auto lg:h-full"
            )}>
                 <GameList 
                    games={games} 
                    teams={teams}
                    odds={odds} 
                    simulatedOdds={simulatedOdds}
                    userPicks={userPicks} 
                    onPick={handlePick} 
                    onReset={handleResetPicks}
                    hasPicks={userPicks.size > 0}
                 />
            </div>

            {/* Right Column: Results & Config (Scrollable) */}
            <div className={clsx(
                "lg:col-span-7 lg:overflow-y-auto lg:pr-1 custom-scrollbar flex flex-col gap-6",
                activeTab === 'picks' ? "hidden lg:flex h-full" : "flex h-auto lg:h-full overflow-visible"
            )}>
              <SimulationConfig 
                count={simCount} 
                setCount={setSimCount} 
                onRun={handleRunSimulation} 
                isLoading={simulating} 
              />
              
              <div className="flex-1 min-h-0">
                 <Results 
                    results={results} 
                    teams={teams} 
                    simDuration={simDuration} 
                    marketPlayoffOdds={marketPlayoffOdds}
                    games={games}
                    odds={odds}
                    simulatedOdds={simulatedOdds}
                    userPicks={userPicks}
                    onPick={handlePick}
                 />
                </div>
            </div>
          </div>
          </>
        )}
    </Layout>
  );
}

// App Router Wrapper
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Simulator />} />
        <Route path="/methodology" element={
            <Layout>
                <Methodology />
            </Layout>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
