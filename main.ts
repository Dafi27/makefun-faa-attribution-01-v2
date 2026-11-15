// polymarket-faa-attribution-01 entry (Node 22, standard library only).
//
// A persistence forecast with a price-level-aware spread. This is the
// sibling of the polymarket-faa-attribution-02 entry: the two competitions
// share the same rules, the same FAA universe and the same practice data
// (the NVIDIA "Next CEO" event), differing only in dates and escrow, so the
// same forecast rule is used here, re-verified on this kit's own practice
// cases (see the verification notes below).
//
//   q_tau(h) = clamp(x + z_tau * sigma(x) * sqrt(h), 0, 1), rounded to 6 decimals
//
// where x is the market's price at the checkpoint and z_tau is the standard
// normal's quantile at each level (-1.644854, -0.674490, 0, 0.674490, 1.644854).
// The house baseline uses a fixed sigma of 0.0025 for every market.
//
// This entry instead uses sigma(x) = 0.008 * sqrt(x * (1 - x)):
//
// - A Yes price is a probability, so its minute-to-minute moves scale with
//   the binomial spread sqrt(x * (1 - x)): a market at 0.5 moves much more
//   than one at 0.02, and a market near 0 or 1 barely moves at all.
// - At x = 0.5 this gives sigma 0.004 (wider than the baseline, which is
//   right for a coin-flip market); at x = 0.0285 it gives about 0.00133
//   (narrower, right for a long-shot market that mostly sits still).
// - No drift: the median stays at the checkpoint price. On the practice
//   cases every drift I tried (recent-trend extrapolation, mean reversion
//   to the hourly mean) scored worse than no drift, so the median is the
//   last price, as in the baseline.
//
// The coefficient 0.008 was chosen by scoring candidate sigmas on the
// kit's practice cases against Polymarket's own recorded prices (the
// practice answers are public history): fixed sigma 0.0025 scores a
// pinball loss of 0.363589, sigma = 0.008 * sqrt(x * (1 - x)) scores
// 0.297691, and narrower variants (0.006) score only a little better
// (0.292504) while leaving almost no room for the jumps the final's
// markets are known to make, so 0.008 is the safer point on that curve.
// The practice is a different event (Next CEO of NVIDIA), so its score
// is no guide to the final; the shape of the spread, not the exact
// constant, is what should carry over.
//
// What an entry must do:
//   - read every <id>.in in the input directory (the grader runs one case
//     at a time, with only that case's file there), canonical JSON
//     {"schema":"makefun/polymarket-case/v1","case","at","horizon_minutes",
//     "quantiles","event",
//     "markets":[{"id","name","slug","yes_token","start","prices"}]}, where
//     `prices` holds one Yes price per minute from `start` to `at`
//     inclusive, so the last one is the price at the checkpoint;
//   - write <id>.out to the output directory:
//     {"forecasts":[{"id","q"}]}, every market of the case exactly once
//     (no other id, no other key), `q` exactly horizon_minutes rows,
//     row h-1 the forecast for minute at+h, each row one finite number
//     in [0,1] per quantile level, non-decreasing; at most 1 MiB.
//     Anything else is an invalid case, scored as if every quantile
//     were 0.5, and an entry with an invalid case takes no prize.
// It runs offline, with no network, under the case's time cap: everything
// it knows is in the case's prices.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level, to 6 decimals. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** Spread coefficient: sigma(x) = SIGMA_K * sqrt(x * (1 - x)). */
const SIGMA_K = 0.008;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  quantiles: number[];
  markets: CaseMarket[];
}

/** x clamped to [0,1] and rounded to 6 decimals (0, never -0). */
const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/** The spread of one market's minute moves, from its checkpoint price. */
function sigma(x: number): number {
  return SIGMA_K * Math.sqrt(Math.max(x * (1 - x), 0));
}

/** The forecast of one market: horizon rows of the five quantiles around its last price. */
function forecast(m: CaseMarket, horizon: number): number[][] {
  if (m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const x = m.prices[m.prices.length - 1] as number;
  const s = sigma(x);
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const row = Z.map((z) => price6(x + z * s * Math.sqrt(h)));
    // Enforce non-decreasing quantiles after rounding.
    for (let j = 1; j < row.length; j++) {
      if ((row[j] as number) < (row[j - 1] as number)) row[j] = row[j - 1] as number;
    }
    rows.push(row);
  }
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.quantiles.length !== QUANTILES.length || c.quantiles.some((t, j) => t !== QUANTILES[j])) throw new Error(`${file} asks for quantiles ${JSON.stringify(c.quantiles)}, not ${JSON.stringify(QUANTILES)}`);
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, c.horizon_minutes) }));
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
}
