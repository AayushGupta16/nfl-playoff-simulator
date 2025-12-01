# Simulation Logic

5,000 Monte Carlo iterations. Each iteration simulates the rest of the season and records who makes the playoffs.

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

For each of 5,000 iterations:

1. Clone current standings
2. Lock in any user-selected game outcomes
3. Simulate remaining games week by week:
   - Roll random number against win probability
   - Update team records
   - Update Elo (dampened by 0.7× to prevent runaway momentum)
4. Apply tiebreakers to determine playoff seeding
5. Record results

## Elo updates during simulation

When simulating games, Elo changes are dampened:

```
K_sim = 20 × 0.7 = 14
```

This prevents simulated win streaks from creating unrealistic favorites.

## Tiebreakers

We implement the main early/mid NFL tiebreaker steps, then fall back to a coin toss.

**Division ties:**
1. Head-to-head
2. Division record  
3. Common games (min 4 opponents)
4. Conference record
5. Strength of Victory
6. Strength of Schedule
7. Coin toss

**Wildcard ties:**
1. Head-to-head (sweep required for 3+ teams)
2. Conference record
3. Common games
4. SOV → SOS → Coin toss

**What we skip:** All of the NFL's point-based and "combined ranking" steps (net points in various subsets of games, net touchdowns, etc). We don't model scores for simulated games and we don't try to approximate those rules. In practice, ties rarely get past SOV/SOS.

When a team is eliminated mid-tiebreaker, we restart from step 1 with remaining teams (per NFL rules).
