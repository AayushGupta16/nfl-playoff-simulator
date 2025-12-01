# NFL Playoff Simulator

Monte Carlo simulation for NFL playoff odds. Runs in your browser.

## What it does

Simulates the rest of the NFL season 5,000 times to estimate each team's probability of:
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

1. Fetches standings from ESPN and odds from Kalshi
2. For each simulation:
   - Simulates remaining games using weighted random outcomes
   - Updates Elo after each game (dampened to prevent runaway favorites)
   - Applies NFL tiebreaker rules
   - Records who made playoffs
3. Aggregates results across all simulations

## Tiebreakers

We implement the main early/mid parts of the NFL tiebreaker procedure:
- Division: H2H → division record → common games → conference record → SOV → SOS → coin toss
- Wildcard: H2H (sweep for 3+) → conference record → common games → SOV → SOS → coin toss

**Limitations:** We skip all of the later point-based and "combined ranking" steps (various net-points rules, net touchdowns). We don't model scores for simulated games and we don't try to approximate those rules. These steps rarely decide real tiebreakers.

When a team is eliminated mid-tiebreaker, we restart from step 1 (per NFL rules).

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
