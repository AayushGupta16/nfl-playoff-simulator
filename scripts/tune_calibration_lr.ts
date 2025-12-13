/* eslint-disable no-console */
/**
 * Calibration tuner / convergence tester (Node-only; requires network).
 *
 * This script is executed via: `npm run tune:calibration`
 *
 * Primary uses:
 * - Compare calibration learning rates
 * - Compare calibration stopping metrics (max vs rmse vs mae)
 * - Compare constant vs staged subSims schedules (to minimize sims-to-threshold)
 *
 * Configuration is read from environment variables because vitest rejects unknown CLI flags.
 */

import axios from 'axios';
import { test } from 'vitest';
import { fetchSchedule, fetchStandings } from '../src/services/nflService.ts';
import { runSimulation } from '../src/simulation/monteCarlo.ts';
import type { Game, Team } from '../src/types.ts';

type ThresholdMetric = 'max' | 'rmse' | 'mae';
type ClampMode = 'clamped' | 'unclamped';

type SubSimsSchedule =
  | { kind: 'constant'; subSims: number }
  | { kind: 'staged'; stages: Array<{ rounds: number; subSims: number }> };

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const kalshiHttp = axios.create({
  baseURL: KALSHI_BASE,
  timeout: 15000,
  headers: { Accept: 'application/json, text/plain, */*' }
});

async function kalshiGet<T = any>(
  path: string,
  params?: Record<string, string | number>,
  opts?: { retries?: number; baseDelayMs?: number }
): Promise<T> {
  const retries = opts?.retries ?? 6;
  const baseDelayMs = opts?.baseDelayMs ?? 750;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await kalshiHttp.get(path, { params });
      return res.data as T;
    } catch (err: any) {
      const status = err?.response?.status;
      const retryAfter = err?.response?.headers?.['retry-after'];
      const isRetryable =
        status === 429 ||
        (typeof status === 'number' && status >= 500) ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'EAI_AGAIN';

      if (!isRetryable || attempt === retries) throw err;

      let delayMs = baseDelayMs * Math.pow(2, attempt);
      if (retryAfter) {
        const s = Number(retryAfter);
        if (Number.isFinite(s) && s > 0) delayMs = Math.max(delayMs, s * 1000);
      }
      delayMs += Math.floor(Math.random() * 200);
      await sleep(delayMs);
    }
  }

  throw new Error('kalshiGet: exhausted retries');
}

async function fetchAllOpenMarkets(seriesTicker: string): Promise<any[]> {
  let all: any[] = [];
  let cursor: string | undefined;
  let pages = 0;
  const MAX_PAGES = 10;
  do {
    const data = await kalshiGet<any>('/markets', {
      limit: 200,
      status: 'open',
      series_ticker: seriesTicker,
      ...(cursor ? { cursor } : {})
    });
    if (data?.markets) all = all.concat(data.markets);
    cursor = data?.cursor;
    pages++;
  } while (cursor && pages < MAX_PAGES);
  return all;
}

// Minimal team-name mapping for KXNFLPLAYOFF parsing
const NAME_TO_ABBR: Record<string, string> = {
  'Buffalo Bills': 'BUF', 'Miami Dolphins': 'MIA', 'New England Patriots': 'NE', 'New York Jets': 'NYJ',
  'Baltimore Ravens': 'BAL', 'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Pittsburgh Steelers': 'PIT',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAC', 'Tennessee Titans': 'TEN',
  'Denver Broncos': 'DEN', 'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
  'Dallas Cowboys': 'DAL', 'New York Giants': 'NYG', 'Philadelphia Eagles': 'PHI', 'Washington Commanders': 'WAS',
  'Chicago Bears': 'CHI', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB', 'Minnesota Vikings': 'MIN',
  'Atlanta Falcons': 'ATL', 'Carolina Panthers': 'CAR', 'New Orleans Saints': 'NO', 'Tampa Bay Buccaneers': 'TB',
  'Arizona Cardinals': 'ARI', 'Los Angeles Rams': 'LA', 'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA'
};

const ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_TO_ABBR).map(([name, abbr]) => [abbr, name])
);

const MONTH_MAP: Record<number, string> = {
  0: 'JAN', 1: 'FEB', 2: 'MAR', 3: 'APR', 4: 'MAY', 5: 'JUN',
  6: 'JUL', 7: 'AUG', 8: 'SEP', 9: 'OCT', 10: 'NOV', 11: 'DEC'
};

function getKalshiDateStr(dateStr: string): string {
  const d = new Date(dateStr);
  const usDate = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const year = usDate.getFullYear().toString().slice(2);
  const month = MONTH_MAP[usDate.getMonth()];
  const day = usDate.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

async function fetchKalshiPlayoffOdds(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const markets = await fetchAllOpenMarkets('KXNFLPLAYOFF');
  for (const m of markets) {
    const parts = String(m.ticker || '').split('-');
    if (parts.length < 3) continue;
    const abbr = parts[parts.length - 1];
    const name = ABBR_TO_NAME[abbr];
    if (!name) continue;
    const last = Number(m.last_price) || 0;
    if (last > 0) out.set(name, last / 100);
  }
  return out;
}

async function fetchKalshiGameOdds(games: Game[]): Promise<Map<string, number>> {
  const oddsMap = new Map<string, number>();
  const allMarkets = await fetchAllOpenMarkets('KXNFLGAME');

  const byEvent = new Map<string, any[]>();
  for (const m of allMarkets) {
    const evt = m.event_ticker;
    if (!evt) continue;
    const arr = byEvent.get(evt);
    if (arr) arr.push(m);
    else byEvent.set(evt, [m]);
  }

  for (const g of games) {
    if (g.isFinished) continue;
    const dateStr = getKalshiDateStr(g.date);
    const homeAbbr = NAME_TO_ABBR[g.homeTeamName] || g.homeTeamName.substring(0, 3).toUpperCase();
    const awayAbbr = NAME_TO_ABBR[g.awayTeamName] || g.awayTeamName.substring(0, 3).toUpperCase();
    const eventTicker = `KXNFLGAME-${dateStr}${awayAbbr}${homeAbbr}`;
    const eventMarkets = byEvent.get(eventTicker);
    if (!eventMarkets || eventMarkets.length < 2) continue;

    const homeMarket = eventMarkets.find((mm: any) => String(mm.ticker || '').endsWith(`-${homeAbbr}`));
    const last = Number(homeMarket?.last_price) || 0;
    if (last <= 0) continue;
    oddsMap.set(g.id, Math.max(0.05, Math.min(0.95, last / 100)));
  }

  return oddsMap;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function parseCsvNums(raw: string | undefined, fallback: number[]): number[] {
  if (!raw) return fallback;
  const xs = raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
  return xs.length ? xs : fallback;
}

function parseSubSimsSchedule(raw: string | undefined, fallbackSubSims: number): SubSimsSchedule {
  if (!raw) return { kind: 'constant', subSims: fallbackSubSims };
  const s = raw.trim();
  if (!s) return { kind: 'constant', subSims: fallbackSubSims };
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  const stages: Array<{ rounds: number; subSims: number }> = [];
  for (const p of parts) {
    const m = p.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (!m) continue;
    const subSims = Number(m[1]);
    const rounds = Number(m[2]);
    if (!Number.isFinite(subSims) || !Number.isFinite(rounds) || subSims <= 0 || rounds <= 0) continue;
    stages.push({ subSims, rounds });
  }
  if (stages.length) return { kind: 'staged', stages };
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return { kind: 'constant', subSims: n };
  return { kind: 'constant', subSims: fallbackSubSims };
}

function getSubSimsForRound(schedule: SubSimsSchedule, roundIndex0: number): number {
  if (schedule.kind === 'constant') return schedule.subSims;
  let idx = roundIndex0;
  for (const st of schedule.stages) {
    if (idx < st.rounds) return st.subSims;
    idx -= st.rounds;
  }
  return schedule.stages[schedule.stages.length - 1]!.subSims;
}

function formatHistogram(values: number[]): string {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts.keys())
    .sort((a, b) => a - b)
    .map(k => `${k}:${counts.get(k)}`)
    .join(' ');
}

function calibrateOnce(params: {
  teams: Team[];
  games: Game[];
  oddsMap: Map<string, number>;
  initialEloMap: Map<string, number>;
  targetPlayoffOdds: Map<string, number>;
  rounds: number;
  schedule: SubSimsSchedule;
  learningRate: number;
  threshold: number;
  thresholdMetric: ThresholdMetric;
  clampMode: ClampMode;
  clampAbsElo: number;
  seed: number;
}): { roundsRun: number; stoppedEarly: boolean; simsUsed: number; finalMaxDiff: number } {
  const {
    teams,
    games,
    oddsMap,
    initialEloMap,
    targetPlayoffOdds,
    rounds,
    schedule,
    learningRate,
    threshold,
    thresholdMetric,
    clampMode,
    clampAbsElo,
    seed
  } = params;

  const picks = new Map<string, string>();
  const eloMap = new Map<string, number>(initialEloMap);

  const originalRandom = Math.random;
  Math.random = mulberry32(seed);

  let roundsRun = 0;
  let stoppedEarly = false;
  let simsUsed = 0;
  let finalMaxDiff = 0;

  try {
    for (let i = 0; i < rounds; i++) {
      const subSims = getSubSimsForRound(schedule, i);
      simsUsed += subSims;
      const { teamResults } = runSimulation(teams, games, subSims, oddsMap, eloMap, picks);

      let maxDiff = 0;
      let sumAbs = 0;
      let sumSq = 0;
      let n = 0;

      for (const res of teamResults) {
        const target = targetPlayoffOdds.get(res.teamName) ?? targetPlayoffOdds.get(res.teamId);
        if (target === undefined) continue;

        const diff = target - res.playoffProb;
        const abs = Math.abs(diff);
        maxDiff = Math.max(maxDiff, abs);
        sumAbs += abs;
        sumSq += diff * diff;
        n++;

        if (abs < threshold) continue;
        let adjustment = diff * learningRate;
        if (clampMode === 'clamped') adjustment = Math.max(-clampAbsElo, Math.min(clampAbsElo, adjustment));
        eloMap.set(res.teamId, (eloMap.get(res.teamId) ?? 1500) + adjustment);
      }

      roundsRun = i + 1;
      finalMaxDiff = maxDiff;

      const rmse = n > 0 ? Math.sqrt(sumSq / n) : 0;
      const mae = n > 0 ? sumAbs / n : 0;
      const stopValue = thresholdMetric === 'rmse' ? rmse : thresholdMetric === 'mae' ? mae : maxDiff;

      if (stopValue < threshold) {
        stoppedEarly = true;
        break;
      }
    }
  } finally {
    Math.random = originalRandom;
  }

  return { roundsRun, stoppedEarly, simsUsed, finalMaxDiff };
}

async function main(): Promise<void> {
  const env = (k: string) => process.env[k];

  const runs = Number(env('TUNE_RUNS') ?? 200);
  const rounds = Number(env('TUNE_ROUNDS') ?? 10);
  const threshold = Number(env('TUNE_THRESHOLD') ?? 0.02);
  const thresholdMetric = (String(env('TUNE_THRESHOLD_METRIC') ?? 'rmse').toLowerCase() as ThresholdMetric);

  const learningRates = parseCsvNums(env('TUNE_LEARNING_RATES'), [500]).filter(n => n > 0);
  const clampAbs = Number(parseCsvNums(env('TUNE_CLAMP_ABS_ELOS'), [50])[0] ?? 50);
  const clampModes: ClampMode[] = ['unclamped', 'clamped'];

  const subSims = Number(env('TUNE_SUB_SIMS') ?? 1000);
  const schedule = parseSubSimsSchedule(env('TUNE_SUB_SIMS_SCHEDULE'), subSims);

  console.log('=== Calibration Convergence Tuner ===');
  console.log(`runs=${runs} rounds=${rounds} thresholdMetric=${thresholdMetric} threshold=${(threshold * 100).toFixed(2)}%`);
  console.log(`learningRates=[${learningRates.join(', ')}] clampAbs=${clampAbs}`);
  if (env('TUNE_SUB_SIMS_SCHEDULE')) console.log(`subSimsSchedule=${env('TUNE_SUB_SIMS_SCHEDULE')}`);
  else console.log(`subSims=${subSims} (constant)`);
  console.log('');

  console.log('Loading ESPN standings + schedule...');
  const [teams, scheduleResp] = await Promise.all([fetchStandings(), fetchSchedule()]);
  const games = scheduleResp.games;
  console.log(`ESPN loaded: teams=${teams.length}, games=${games.length} (currentWeek=${scheduleResp.currentWeek})`);

  console.log('Loading Kalshi markets (game odds, playoff odds)...');
  const [gameOdds, playoffOdds] = await Promise.all([
    fetchKalshiGameOdds(games),
    fetchKalshiPlayoffOdds()
  ]);
  console.log(`Kalshi loaded: gameOdds=${gameOdds.size}, playoffOdds=${playoffOdds.size}`);
  if (playoffOdds.size === 0) throw new Error('No Kalshi playoff odds loaded');

  // Initial Elo map: start from 1500 for everyone (keeps convergence comparisons simple and fast).
  const initialEloMap = new Map<string, number>(teams.map(t => [t.id, 1500] as const));

  for (const lr of learningRates) {
    for (const mode of clampModes) {
      const roundsArr: number[] = [];
      const simsArr: number[] = [];
      let stopCount = 0;

      for (let r = 0; r < runs; r++) {
        const seed = (lr * 1000 + (mode === 'clamped' ? 17 : 97) + r * 1337) >>> 0;
        const res = calibrateOnce({
          teams,
          games,
          oddsMap: gameOdds,
          initialEloMap,
          targetPlayoffOdds: playoffOdds,
          rounds,
          schedule,
          learningRate: lr,
          threshold,
          thresholdMetric,
          clampMode: mode,
          clampAbsElo: clampAbs,
          seed
        });
        roundsArr.push(res.roundsRun);
        simsArr.push(res.simsUsed);
        if (res.stoppedEarly) stopCount++;
      }

      console.log(
        `${mode.padEnd(10)} lr=${String(lr).padStart(4)} ` +
          `stopEarly=${Math.round((stopCount / runs) * 100)}% ` +
          `avgRounds=${mean(roundsArr).toFixed(2)} ` +
          `avgSims=${Math.round(mean(simsArr))} ` +
          `hist=${formatHistogram(roundsArr)}`
      );
    }
  }
}

test('tune calibration convergence (manual)', async () => {
  await main();
});


