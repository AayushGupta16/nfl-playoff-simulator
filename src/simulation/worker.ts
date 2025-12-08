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
            
            const iterations = 15;
            const subSims = 1000;
            const learningRate = 300;
            const threshold = 0.02; 

            let roundsRun = 0;
            let lastMaxDiff = 0;
            let stoppedByThreshold = false;
            
            for (let i = 0; i < iterations; i++) {
                console.log(`--- Calibration Round ${i + 1} ---`);
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
                    const currentElo = eloMap.get(res.teamId) || 1500;

                    if (Math.abs(diff) >= threshold) {
                        console.log(`${res.teamName}: Elo ${Math.round(currentElo)} | Diff ${(diff * 100).toFixed(1)}% (Target ${(target * 100).toFixed(1)}% vs Sim ${(res.playoffProb * 100).toFixed(1)}%)`);
                    }

                    if (Math.abs(diff) < threshold) continue;
                    
                    let adjustment = diff * learningRate;
                    // Clamp adjustment
                    adjustment = Math.max(-50, Math.min(50, adjustment));
                    
                    eloMap.set(res.teamId, currentElo + adjustment);
                    maxDiff = Math.max(maxDiff, Math.abs(diff));
                }
                
                roundsRun = i + 1;
                lastMaxDiff = maxDiff;

                // If we're close enough, stop early
                if (maxDiff < threshold) {
                    stoppedByThreshold = true;
                    break;
                }
            }

            if (stoppedByThreshold) {
                console.log(
                    `Calibration finished early after ${roundsRun} rounds: ` +
                    `max diff ${(lastMaxDiff * 100).toFixed(2)}% < ` +
                    `${(threshold * 100).toFixed(1)}% threshold.`
                );
            } else {
                console.log(
                    `Calibration finished after hitting iteration limit (${iterations} rounds). ` +
                    `Final max diff ${(lastMaxDiff * 100).toFixed(2)}%.`
                );
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
