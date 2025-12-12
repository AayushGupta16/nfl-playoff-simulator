# Accuracy

This simulator has **not been rigorously validated**. Use it for fun, not for betting.

## What we compare against

When sanity-checking outputs, we look at:

1. **Kalshi game markets** — If our sim says Team A has 70% to win and Kalshi says 65%, that's fine. If we say 90% and Kalshi says 50%, something's wrong.

2. **ESPN/NFL.com playoff projections** — Rough directional check. We don't expect exact matches since methodologies differ.

## Known limitations

### Tiebreakers are record-accurate

We implement all record-based steps (head-to-head, division/conference records, common games, SOV, SOS) and have rigorously verified them with unit tests (`npm test`). This includes correct handling of complex multi-team rules (sweep-only H2H, restart-after-elimination) and correct calculation of SOS/SOV (using combined opponent records weighted by games played).

We skip the later, point-based steps in the official rules (combined rankings, net points in various subsets of games, net touchdowns). These typically only matter if teams are tied on SOV and SOS, which is extremely rare.

When all implemented steps fail to break a tie, we use random selection (the NFL uses a coin toss, so this is actually correct behavior for the final step).

### Elo assumptions are rough

- Home field advantage (48 Elo pts → ~57% home win rate) is borrowed from common implementations, not calibrated to recent NFL data.
- The wins-to-Elo conversion (28 pts per win) is a rough approximation.
- When Kalshi markets are missing, we make assumptions (e.g., P(>0 wins) = 0.99).

### No injury/news integration

Elo and market odds don't update in real-time for breaking news. If a star QB gets injured after markets close, our sim won't know.

### Simulation variance

10,000 iterations gives roughly ±1% precision on playoff odds. For rare events (like a bad team getting the #1 seed), variance is higher.

## Future work

If someone wants to actually validate this:

1. Run the sim at the start of each week during a season
2. Record predicted playoff probabilities
3. At season end, compute Brier score: `(1/N) * Σ(predicted - actual)²`
4. Target: Brier < 0.20 would be decent, < 0.15 would be good

We haven't done this yet. The "Target Score: < 0.15" mentioned in earlier versions of this doc was aspirational, not measured.
