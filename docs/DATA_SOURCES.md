# Data Sources

Two APIs. No keys required.

## ESPN

**Standings:**
```
GET https://site.api.espn.com/apis/v2/sports/football/nfl/standings
```
Gives us wins, losses, division/conference records.

**Schedule:**
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD-YYYYMMDD
```
Game dates, teams, scores, winners.

## Kalshi

**Game winner markets:**
```
GET https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXNFLGAME&status=open
```
Win probability for upcoming games. We use `last_price / 100`.

**Season win totals:**
```
GET https://api.elections.kalshi.com/trade-api/v2/series?limit=200
```
Then fetch markets for each `KXNFLWINS-{TEAM}` series. These give P(wins > X) which we sum to get expected wins, then convert to Elo.

## CORS

Kalshi blocks browser requests. We proxy through Vite in dev:

```ts
// vite.config.ts
proxy: {
  '/api/kalshi': {
    target: 'https://api.elections.kalshi.com',
    changeOrigin: true,
    rewrite: path => path.replace(/^\/api\/kalshi/, '')
  }
}
```

## Team abbreviation mapping

Kalshi uses different abbreviations than ESPN:

| ESPN | Kalshi |
|------|--------|
| JAX  | JAC    |
| WSH  | WAS    |
| LAR  | LA     |
