import { runSimulation } from './monteCarlo';

// Worker event listeners
self.onmessage = (e: MessageEvent) => {
    const { teams, games, count, odds, userPicks, kalshiElos } = e.data;
    
    try {
        // Convert arrays of entries back to Maps
        const picksMap = new Map<string, string>(userPicks);
        const oddsMap = new Map<string, number>(odds);
        const eloMap = kalshiElos ? new Map<string, number>(kalshiElos) : new Map<string, number>();

        const { teamResults, simulatedOdds } = runSimulation(
            teams, 
            games, 
            count, 
            oddsMap, 
            eloMap,
            picksMap
        );
        
        self.postMessage({ 
            type: 'SUCCESS', 
            results: teamResults,
            simulatedOdds: Array.from(simulatedOdds.entries())
        });
    } catch (error) {
        self.postMessage({ type: 'ERROR', error: String(error) });
    }
};
