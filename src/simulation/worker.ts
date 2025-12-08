import { runSimulation } from './monteCarlo';

// Worker event listeners
self.onmessage = (e: MessageEvent) => {
    const { 
        action, // 'SIMULATE' | 'CALIBRATE'
        teams, 
        games, 
        count, 
        odds, 
        userPicks, 
        kalshiElos,
        targetPlayoffOdds 
    } = e.data;
    
    try {
        // Convert arrays of entries back to Maps
        const picksMap = new Map<string, string>(userPicks);
        const oddsMap = new Map<string, number>(odds);
        
        // If we are calibrating, we start with the provided Elos and adjust them.
        // If simulating, we just use them as is.
        
        if (action === 'CALIBRATE') {
            const eloMap = new Map<string, number>(kalshiElos);
            const targetMap = new Map<string, number>(targetPlayoffOdds);
            
            const iterations = 5;
            const subSims = 1000;
            const learningRate = 300;
            const threshold = 0.05;
            
            for (let i = 0; i < iterations; i++) {
                // Run short simulation
                const { teamResults } = runSimulation(
                    teams, 
                    games, 
                    subSims, 
                    oddsMap, 
                    eloMap,
                    picksMap
                );
                
                let maxDiff = 0;
                
                // Adjust Elos based on results
                for (const res of teamResults) {
                    const target = targetMap.get(res.teamName) ?? targetMap.get(res.teamId);
                    if (target === undefined) continue;
                    
                    const diff = target - res.playoffProb;
                    if (Math.abs(diff) < threshold) continue;
                    
                    const currentElo = eloMap.get(res.teamId) || 1500;
                    let adjustment = diff * learningRate;
                    // Clamp adjustment
                    adjustment = Math.max(-50, Math.min(50, adjustment));
                    
                    eloMap.set(res.teamId, currentElo + adjustment);
                    maxDiff = Math.max(maxDiff, Math.abs(diff));
                }
                
                // If we're close enough, stop early
                if (maxDiff < threshold) break;
            }
            
            self.postMessage({ 
                type: 'CALIBRATION_COMPLETE', 
                calibratedElos: Array.from(eloMap.entries()) 
            });
            
        } else {
            // Default: SIMULATE
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
        }
    } catch (error) {
        self.postMessage({ type: 'ERROR', error: String(error) });
    }
};
