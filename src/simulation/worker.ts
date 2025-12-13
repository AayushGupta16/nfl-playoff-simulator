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
            
            const iterations = 10;
            // Calibration uses many short simulations per round; `subSims` controls runtime vs noise.
            // Empirically, constant 1000 sims/round hits RMSE<2% fastest (lowest sims-to-threshold).
            const subSims = 1000;
            // Calibration "learning rate":
            // Converts a playoff-probability error (diff = target - simulated, in [−1, +1])
            // into an Elo adjustment in points per round: adjustment = diff * learningRate.
            // Tuned via `npm run tune:calibration` (see scripts/tune:calibration).
            // Picked to reach RMSE<2% quickly under the current calibration setup.
            const learningRate = 500;
            // Stopping rule uses RMSE across teams (more stable than max error).
            const threshold = 0.02; // 2%

            let roundsRun = 0;
            let lastMaxDiff = 0;
            let lastRmse = 0;
            let lastMae = 0;
            let stoppedByThreshold = false;
            
            for (let i = 0; i < iterations; i++) {
                console.log(`--- Calibration Round ${i + 1} (subSims=${subSims}) ---`);
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
                let sumAbs = 0;
                let sumSq = 0;
                let n = 0;
                
                // Adjust Elos based on results
                for (const res of teamResults) {
                    const target = targetMap.get(res.teamName) ?? targetMap.get(res.teamId);
                    if (target === undefined) continue;
                    
                    const diff = target - res.playoffProb;
                    const currentElo = eloMap.get(res.teamId) || 1500;

                    // Aggregate error metrics (probability units)
                    const abs = Math.abs(diff);
                    maxDiff = Math.max(maxDiff, abs);
                    sumAbs += abs;
                    sumSq += diff * diff;
                    n++;

                    if (Math.abs(diff) >= threshold) {
                        console.log(`${res.teamName}: Elo ${Math.round(currentElo)} | Diff ${(diff * 100).toFixed(1)}% (Target ${(target * 100).toFixed(1)}% vs Sim ${(res.playoffProb * 100).toFixed(1)}%)`);
                    }

                    // Note: We still update on per-team abs(diff) >= threshold (keeps updates focused),
                    // but we stop the overall loop based on RMSE.
                    if (Math.abs(diff) < threshold) continue;
                    
                    const adjustment = diff * learningRate;
                    
                    eloMap.set(res.teamId, currentElo + adjustment);
                }
                
                const rmse = n > 0 ? Math.sqrt(sumSq / n) : 0;
                const mae = n > 0 ? sumAbs / n : 0;
                console.log(
                    `Round ${i + 1} summary: rmse ${(rmse * 100).toFixed(2)}% | ` +
                        `mae ${(mae * 100).toFixed(2)}% | max ${(maxDiff * 100).toFixed(2)}%`
                );
                
                roundsRun = i + 1;
                lastMaxDiff = maxDiff;
                lastRmse = rmse;
                lastMae = mae;

                // If we're close enough, stop early
                if (rmse < threshold) {
                    stoppedByThreshold = true;
                    break;
                }
            }

            if (stoppedByThreshold) {
                console.log(
                    `Calibration finished early after ${roundsRun} rounds: ` +
                    `rmse ${(lastRmse * 100).toFixed(2)}% < ` +
                    `${(threshold * 100).toFixed(1)}% threshold.`
                );
            } else {
                console.log(
                    `Calibration finished after hitting iteration limit (${iterations} rounds). ` +
                    `Final rmse ${(lastRmse * 100).toFixed(2)}%.`
                );
            }
            
            self.postMessage({ 
                type: 'CALIBRATION_COMPLETE', 
                calibratedElos: Array.from(eloMap.entries()),
                calibrationMeta: {
                    roundsRun,
                    stoppedByThreshold,
                    metric: 'rmse',
                    finalRmse: lastRmse,
                    finalMae: lastMae,
                    finalMaxDiff: lastMaxDiff,
                    threshold,
                    iterations
                }
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
