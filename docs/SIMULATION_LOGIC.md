# Simulation Logic

10,000 Monte Carlo iterations. Each iteration simulates the rest of the season and records who makes the playoffs.

## Game Outcomes

For each unplayed game, we need a win probability. We use Kalshi prediction markets for everything:

1. **Kalshi game markets** — Real-money prediction markets for upcoming games (~2 weeks out)
2. **Kalshi-derived Elo** — For games without direct market odds (far-future weeks), we compute win probability from team Elo ratings

### Elo Formula

```
P(Home wins) = 1 / (1 + 10^(-(HomeElo - AwayElo + 48) / 400))
```

The +48 is home field advantage (~57% baseline for equal teams).

### Where Elo Comes From

Each team's Elo is derived from Kalshi "Season Win Total" markets. The market already prices in everything: point differential, strength of schedule, injuries, etc.

1. Fetch P(team wins > k games) for k = 0..16
2. Sum probabilities to get expected wins: `E[wins] = Σ P(wins > k)`
3. Convert to Elo: `Elo = 1500 + (expectedWins - 8.5) × 28`

A team expected to win 12 games → ~1600 Elo. A 5-win team → ~1400 Elo.

This is intentionally market-based, not a traditional Elo system that replays games. We trust the market.

## Simulation loop

For each of 10,000 iterations:

1. Clone current standings
2. Lock in any user-selected game outcomes
3. Simulate remaining games week by week:
   - Roll random number against win probability
   - Update team records
   - Update Elo
4. Apply tiebreakers to determine playoff seeding
5. Record results

## Elo updates during simulation

When simulating games, we use a standard K-factor of 20 to update ratings. This allows simulated win streaks to improve a team's odds in subsequent simulated games.

## Playoff-odds calibration (pre-simulation)

If Kalshi "Make Playoffs" markets are available, we run an **Elo calibration** step before the main simulation.

- **Goal**: adjust team Elo ratings so that the simulator's *unconditional* playoff probabilities match Kalshi's market probabilities as closely as possible.
- **Mechanism**: run short Monte Carlo batches, compare each team's simulated playoff probability to the market target, then nudge Elo up/down proportional to the difference.
- **Stopping rule**: stop early when **RMSE across teams** is below **2%**.
  - **RMSE** (root mean squared error) is like an average error size, but it penalizes big misses more than a plain average because it squares errors before averaging.
- **Runtime controls**: we cap calibration to **10 rounds** and run **1000 simulations per round** (so calibration usually stops after ~5–6 rounds once RMSE drops below 2%).

Calibration is implemented in `src/simulation/worker.ts`.

## Tiebreakers

We implement the main early/mid NFL tiebreaker steps, then fall back to a coin toss.

**Division ties:**
1. Head-to-head (sweep-only for 3+ teams)
2. Division record  
3. Common games (min 4 common games, not opponents)
4. Conference record
5. Strength of Victory (weighted by games played)
6. Strength of Schedule (weighted by games played)
7. Coin toss

**Wildcard ties:**
1. Head-to-head (sweep-only for 3+ teams)
2. Conference record
3. Common games (min 4 common games)
4. SOV → SOS → Coin toss

**Validation:**
We have a unit test suite (`src/simulation/tieBreakers.test.ts`) that is intended to verify each of these steps individually, including the "restart after elimination" rule and multi-team edge cases.

**What we skip:** All of the NFL's point-based and "combined ranking" steps (net points in various subsets of games, net touchdowns, etc). We don't model scores for simulated games and we don't try to approximate those rules. In practice, ties rarely get past SOV/SOS.

When a team is eliminated mid-tiebreaker, we restart from step 1 with remaining teams (per NFL rules).
