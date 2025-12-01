import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchSchedule, fetchStandings } from './services/nflService';
import { fetchKalshiOdds } from './services/kalshiService';
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

// Main Simulator Component
function Simulator() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [odds, setOdds] = useState<Map<string, number>>(new Map());
  const [kalshiElos, setKalshiElos] = useState<Map<string, number>>(new Map());
  const [simulatedOdds, setSimulatedOdds] = useState<Map<string, number>>(new Map());
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Config State
  const [simCount, setSimCount] = useState(5000); // Default 5,000
  const [userPicks, setUserPicks] = useState<Map<string, string>>(new Map());

  // Timing State
  const [simDuration, setSimDuration] = useState<number | null>(null);
  const simStartTime = useRef<number>(0);

  // Worker Ref
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize Worker
    workerRef.current = new Worker(new URL('./simulation/worker.ts', import.meta.url), {
        type: 'module'
    });

    workerRef.current.onmessage = (e) => {
        const { type, results, simulatedOdds, error } = e.data;
        if (type === 'SUCCESS') {
            setResults(results);
            if (simulatedOdds) {
                setSimulatedOdds(new Map(simulatedOdds));
            }
            setSimDuration(performance.now() - simStartTime.current);
        } else {
            console.error("Worker Error:", error);
            setError("Simulation failed.");
        }
        setSimulating(false);
    };

    return () => {
        workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log("Fetching NFL data...");
        
        // Parallelize fetching:
        // Chain 1: Standings -> Kalshi Win Totals (Elo)
        // Chain 2: Schedule -> Kalshi Game Odds
        
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

        // Wait for both chains
        const [
            { teams: fetchedTeams, eloMap },
            { games: fetchedGames, kalshiOdds }
        ] = await Promise.all([eloPromise, oddsPromise]);

        if (fetchedTeams.length === 0) {
          setError("Failed to load team data. Please check your connection.");
        }

        setTeams(fetchedTeams);
        setGames(fetchedGames);
        
        console.log(`Kalshi odds loaded for ${kalshiOdds.size} games`);
        console.log(`Kalshi Win Totals (Current Elo) loaded for ${eloMap.size} teams`);
        
        setKalshiElos(eloMap);
        
        // Apply Elo-based odds as fallback for games without Kalshi odds (Week 16-18)
        const combinedOdds = applyEloOdds(fetchedGames, fetchedTeams, kalshiOdds);
        console.log(`Combined odds (Kalshi + Elo fallback) for ${combinedOdds.size} games`);
        
        setOdds(combinedOdds);
        
      } catch (err) {
        console.error(err);
        setError("An error occurred while loading data.");
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  const handleRunSimulation = useCallback((count: number) => {
    if (teams.length === 0 || games.length === 0 || !workerRef.current) return;

    setSimulating(true);
    setSimDuration(null);
    simStartTime.current = performance.now();
    
    // Send data to worker
    workerRef.current.postMessage({
        teams,
        games,
        count,
        odds: Array.from(odds.entries()),
        userPicks: Array.from(userPicks.entries()),
        kalshiElos: Array.from(kalshiElos.entries())
    });
  }, [teams, games, odds, userPicks, kalshiElos]);

  // Auto-run whenever user picks change
  useEffect(() => {
    if (!loadingData && teams.length > 0) {
        const timer = setTimeout(() => {
            handleRunSimulation(simCount); 
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [userPicks, loadingData, handleRunSimulation, teams.length, simCount]);

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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-[calc(100vh-8rem)]">
            
            {/* Left Column: Schedule (Scrollable) */}
          <div className="lg:col-span-5 h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
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
          <div className="lg:col-span-7 h-full overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-6">
              <SimulationConfig 
                count={simCount} 
                setCount={setSimCount} 
                onRun={handleRunSimulation} 
                isLoading={simulating} 
              />
              
              <div className="flex-1 min-h-0">
                 <Results results={results} teams={teams} simDuration={simDuration} />
                </div>
            </div>
          </div>
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
