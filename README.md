# NFL Playoff Simulator

Monte Carlo simulation for NFL playoff odds. Runs in your browser.

## What it does

Simulates the rest of the NFL season 10,000 times to estimate each team's probability of:
- Making the playoffs
- Winning their division  
- Getting the #1 seed

Uses Kalshi prediction markets for game odds when available, falls back to Elo ratings.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173

## How it works

1. **Fetches Market Data:** 
   - Gets current standings from ESPN.
   - Gets game odds and season win totals from **Kalshi**.
2. **Derives Team Strength:**
   - Converts Kalshi's "Expected Wins" into an Elo rating for each team.
   - This allows us to model future games that don't have markets yet.
3. **Monte Carlo Simulation:**
   - Simulates the remaining schedule 10,000 times.
   - Updates Elo dynamically after each simulated game.
   - Applies NFL tiebreaker rules to determine seeding.
4. **Aggregates Results:**
   - Calculates % chance of making playoffs, winning division, etc.

## Tiebreakers

The simulator implements the main early/mid parts of the NFL tiebreaker procedure:
- Division: H2H → division record → common games → conference record → SOV → SOS → coin toss
- Wildcard: H2H (sweep for 3+) → conference record → common games → SOV → SOS → coin toss

**Limitations:** It skips all of the later point-based and "combined ranking" steps (various net-points rules, net touchdowns). It doesn't model scores for simulated games and doesn't try to approximate those rules. These steps rarely decide real tiebreakers.

When a team is eliminated mid-tiebreaker, the simulator restarts from step 1 (per NFL rules).

## Click games to set outcomes

Select a winner for any upcoming game to see how it affects playoff odds. The simulation re-runs with your picks locked in.

## Accuracy

This hasn't been rigorously validated. The Elo parameters (home field advantage, K-factor) are borrowed from common implementations, not calibrated specifically for this tool. Use for fun, not for betting.

See [docs/ACCURACY_ANALYSIS.md](docs/ACCURACY_ANALYSIS.md) for more details.

## Tech

- React + TypeScript + Vite
- Web Worker for non-blocking simulation
- Tailwind CSS

## License

MIT
