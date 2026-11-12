// SPDX-License-Identifier: MIT
// pumpfun-top5-forecast-01 entry: a horizon-aware trajectory forecast.
//
// The house baseline assumes the last mark's chart persists. This entry instead
// models the forecast as what the scorer actually averages: a mixture over the
// seven answer reads, each at its own distance from the cut.
//
//   - Every coin's log10(market cap in SOL) is tracked across all marks; a
//     recency-weighted slope is extrapolated to EACH answer read with
//     exponential damping (a 10-minute burst is not compounded for hours),
//     with small adjustments for venue (graduated pool coins persist better
//     than curve coins), liquidity depth, volatility and stale age.
//   - Place probabilities come from a Plackett-Luce cascade per read, with a
//     temperature that widens with that read's horizon, averaged over reads.
//   - An unnamed share per place, growing with the horizon and with the place,
//     covers the winners no history can name: coins born after the cut and
//     coins that were born before it but never ranked in the history's top
//     200. In the practice rehearsal the last read's places 1, 4 and 5 were
//     held by mints absent from the history.
//   - The remaining rows of each place (max 100) are filled with tiny
//     probabilities for mid-tier coins and p = 0 rows aimed at "zombie chart
//     survivors" — graduated, older, momentum-dead coins that are likely to
//     still sit on the answer chart (and so dilute the unnamed share) but
//     have almost no chance of a top-5 place. Excluding them concentrates
//     the unnamed share on survivors and newcomers.
//   - Each place's size is projected per read from that rank's own cap
//     trajectory (an order statistic of the whole cohort, not one coin),
//     blended with a logarithmic cohort-growth drift, with a spread that
//     widens with the horizon, narrows from place 1 to place 5, and carries
//     a fat right tail for a new super-runner.
//
// All times come from task.json (t0, history_until, reads); nothing about the
// practice or final dates is hardcoded. No randomness, no clock, no network:
// two runs on the same input produce byte-identical output.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const HOUR = 3_600_000;
const MICRO = 1_000_000;

interface Row {
  rank: number;
  mint: string;
  market_cap_lamports: string | number;
  venue?: string;
  created_at?: string;
  complete?: boolean;
  mayhem?: boolean;
  quote_reserves_lamports?: string | number;
}
interface Mark { at: string; ok?: boolean; rows?: Row[] | null }
interface Task {
  t0: string;
  history_until: string;
  reads: string[];
  places: number;
  chart_size: number;
  output: string;
  size: { edges: number[] };
}

const task = JSON.parse(readFileSync(join(INPUT_DIR, 'task.json'), 'utf8')) as Task;
const cutMs = Date.parse(task.history_until);
const t0Ms = Date.parse(task.t0);
const readMs = task.reads.map((r) => Date.parse(r)).filter((x) => Number.isFinite(x));
const places = task.places;
const edges = task.size.edges;

const lines = readFileSync(join(INPUT_DIR, 'history.ndjson'), 'utf8').split('\n').filter((l) => l !== '');
const marks = lines
  .map((l) => JSON.parse(l) as Mark)
  .filter((m) => m.ok !== false && Array.isArray(m.rows) && m.rows.length > 0)
  .map((m) => ({ atMs: Date.parse(m.at), rows: [...m.rows!].sort((a, b) => a.rank - b.rank) }))
  .filter((m) => Number.isFinite(m.atMs))
  .sort((a, b) => a.atMs - b.atMs);
if (marks.length === 0) throw new Error('the history holds no mark with rows');
const lastMark = marks[marks.length - 1]!;
if (lastMark.rows.length < places) throw new Error('the last mark ranks fewer coins than the places scored');

// ---- time geometry, all derived from task.json ----------------------------
const markT = marks.map((m) => (m.atMs - cutMs) / HOUR); // hours relative to the cut, <= ~0
const spanH = Math.max(0.05, markT[markT.length - 1]! - markT[0]!);
const histH = Math.max(0.25, (cutMs - t0Ms) / HOUR); // opening to cut: 1h practice, 11h final
const readH = (readMs.length > 0 ? readMs : [cutMs + HOUR]).map((r) => Math.max(0, (r - cutMs) / HOUR));
const hMid = readH.reduce((a, b) => a + b, 0) / readH.length;
const sqrtH = Math.sqrt(Math.max(0.05, hMid));

/** log10 of a cap in SOL, as the scorer takes it: log10(lamports) - 9. */
const sizeOf = (lamports: string | number): number => Math.log10(Number(BigInt(lamports))) - 9;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

// ---- recency-weighted linear fit of y against t (hours) --------------------
function fit(points: Array<{ t: number; y: number }>, halfLifeH: number): { slope: number; lastFit: number; residSd: number } {
  if (points.length === 0) return { slope: 0, lastFit: 0, residSd: 0 };
  const tRef = points[points.length - 1]!.t;
  if (points.length === 1) return { slope: 0, lastFit: points[0]!.y, residSd: 0 };
  let sw = 0, st = 0, sy = 0;
  const ws = points.map((p) => {
    const w = Math.pow(0.5, Math.max(0, tRef - p.t) / halfLifeH);
    sw += w; st += w * p.t; sy += w * p.y;
    return w;
  });
  const mt = st / sw, my = sy / sw;
  let num = 0, den = 0;
  points.forEach((p, i) => { const w = ws[i]!; num += w * (p.t - mt) * (p.y - my); den += w * (p.t - mt) * (p.t - mt); });
  const slope = den > 1e-9 ? num / den : 0;
  let rv = 0;
  points.forEach((p, i) => { const r = p.y - (my + slope * (p.t - mt)); rv += ws[i]! * r * r; });
  return { slope, lastFit: my + slope * (tRef - mt), residSd: Math.sqrt(rv / sw) };
}
const slopeHalfLife = clamp(spanH / 3, 0.2, 1.5);

// ---- per-coin trajectories --------------------------------------------------
interface Coin {
  mint: string;
  points: Array<{ t: number; y: number; rank: number }>;
  lastLog: number;
  lastRank: number;
  bestRank: number;
  inLastMark: boolean;
  venue: string;
  complete: boolean;
  mayhem: boolean;
  quoteSol: number;
  createdMs: number;
  slope: number;
  vol: number;
  adj: number;
  projMid: number;
}
const byMint = new Map<string, Coin>();
marks.forEach((m, mi) => {
  const t = markT[mi]!;
  for (const r of m.rows) {
    const y = sizeOf(r.market_cap_lamports);
    let c = byMint.get(r.mint);
    if (c === undefined) {
      c = {
        mint: r.mint, points: [], lastLog: y, lastRank: r.rank, bestRank: r.rank,
        inLastMark: false, venue: r.venue ?? 'curve', complete: r.complete === true,
        mayhem: r.mayhem === true, quoteSol: 0,
        createdMs: r.created_at !== undefined ? Date.parse(r.created_at) : t0Ms,
        slope: 0, vol: 0, adj: 0, projMid: y,
      };
      byMint.set(r.mint, c);
    }
    c.points.push({ t, y, rank: r.rank });
    c.lastLog = y;
    c.lastRank = r.rank;
    c.bestRank = Math.min(c.bestRank, r.rank);
    c.inLastMark = mi === marks.length - 1;
    c.venue = r.venue ?? c.venue;
    c.complete = r.complete === true;
    c.mayhem = r.mayhem === true;
    if (r.quote_reserves_lamports !== undefined) c.quoteSol = Number(BigInt(r.quote_reserves_lamports)) / 1e9;
    if (r.created_at !== undefined) c.createdMs = Date.parse(r.created_at);
  }
});

// Damped extrapolation: a slope is trusted for ~tau hours, then flattens.
const TAU_DRIFT = 2.0;
const dampAt = (h: number): number => TAU_DRIFT * (1 - Math.exp(-h / TAU_DRIFT));
let leaderLog = -Infinity;
for (const c of byMint.values()) if (c.inLastMark) leaderLog = Math.max(leaderLog, c.lastLog);
for (const c of byMint.values()) {
  const f = fit(c.points, slopeHalfLife);
  const shrink = c.points.length / (c.points.length + 3);
  c.slope = clamp(f.slope * shrink, -2, 2);
  c.vol = clamp(f.residSd, 0, 0.6);
  const driftMid = clamp(c.slope * dampAt(hMid), -0.7, 0.45);
  // No coin is projected far above the current leader's level: a burst that
  // has not yet reached the top rarely vaults straight past it.
  c.projMid = Math.min(c.lastLog + driftMid, leaderLog + 0.3);
  // Strength adjustments in log10 units: graduated coins persist, deeper
  // liquidity persists, wild or stale coins fade. All deliberately small
  // next to the cap level itself.
  let adj = 0;
  if (c.venue === 'pool') adj += 0.05;
  else if (c.venue === 'migrating') adj += 0.02;
  if (c.complete) adj += 0.03;
  if (c.quoteSol > 0) {
    const liq = Math.log10(Math.max(1, c.quoteSol)) - 0.5 * c.lastLog;
    adj += 0.06 * clamp(liq - 0.55, -0.5, 0.5);
  }
  adj -= 0.18 * Math.max(0, c.vol - 0.15);
  const ageH = Math.max(0, (cutMs - c.createdMs) / HOUR);
  if (ageH > 2 && driftMid <= 0.02) adj -= 0.06;
  if (c.mayhem && c.venue === 'pool') adj += 0.02; // priced on double supply once pooled
  c.adj = adj;
}
/** A coin's Plackett-Luce strength (projected log cap + adjustments) at read horizon h. */
const strengthAt = (c: Coin, h: number): number =>
  Math.min(c.lastLog + clamp(c.slope * dampAt(h), -0.7, 0.45), leaderLog + 0.3) + c.adj;

// ---- place-cap trajectories (for sizes, and place thresholds) ---------------
const TAU_SIZE = 1.2;
const dampSizeAt = (h: number): number => TAU_SIZE * (1 - Math.exp(-h / TAU_SIZE));
const BETA_SIZE = [0.22, 0.18, 0.14, 0.14, 0.14];
const placeSeries: Array<{ lastY: number; slope: number; resid: number }> = [];
for (let k = 1; k <= places; k++) {
  const pts: Array<{ t: number; y: number }> = [];
  marks.forEach((m, mi) => { if (m.rows.length >= k) pts.push({ t: markT[mi]!, y: sizeOf(m.rows[k - 1]!.market_cap_lamports) }); });
  const f = fit(pts, slopeHalfLife);
  placeSeries.push({ lastY: pts[pts.length - 1]!.y, slope: f.slope, resid: clamp(f.residSd, 0, 0.25) });
}
/** Projected log cap of place k at read horizon h, before cross-place ordering. */
const placeLogAt = (k: number, h: number): number => {
  const s = placeSeries[k - 1]!;
  const driftSlope = clamp(s.slope * dampSizeAt(h), -0.3, 0.35);
  const driftCohort = (BETA_SIZE[k - 1] ?? 0.14) * Math.log(1 + h / Math.max(histH, 1.5));
  return s.lastY + 0.5 * driftSlope + 0.5 * driftCohort;
};
const projPlaceMid: number[] = [];
for (let k = 1; k <= places; k++) {
  let proj = placeLogAt(k, hMid);
  if (k > 1) proj = Math.min(proj, projPlaceMid[k - 2]! - 0.015);
  projPlaceMid.push(proj);
}

// ---- candidates and per-read Plackett-Luce place probabilities --------------
const place5Log = projPlaceMid[places - 1]!;
const candidates = [...byMint.values()]
  .filter((c) => (c.inLastMark && c.lastRank <= 70) || c.bestRank <= 25 || c.projMid >= place5Log - 0.9)
  .sort((a, b) => (b.projMid + b.adj) - (a.projMid + a.adj) || (a.mint < b.mint ? -1 : 1))
  .slice(0, 64);

/** One Plackett-Luce cascade: q[i][k] with each place summing to 1 over candidates. */
function plCascade(weights: number[]): number[][] {
  const n = weights.length;
  const totalW = weights.reduce((a, b) => a + b, 0);
  const q: number[][] = weights.map(() => new Array<number>(places).fill(0));
  let expectedPlacedW = 0;
  const placedMass = weights.map(() => 0);
  for (let k = 0; k < places; k++) {
    const wRemain = Math.max(1e-12, totalW - expectedPlacedW);
    let sumQ = 0;
    weights.forEach((w, i) => {
      const v = Math.max(0, 1 - placedMass[i]!) * (w / wRemain);
      q[i]![k] = v;
      sumQ += v;
    });
    if (sumQ > 0) weights.forEach((_, i) => { q[i]![k] = q[i]![k]! / sumQ; });
    weights.forEach((w, i) => { expectedPlacedW += w * q[i]![k]!; placedMass[i] = placedMass[i]! + q[i]![k]!; });
  }
  return q;
}
// Average the cascade over the answer reads, each at its own horizon and
// temperature: the score is the mean over reads, so the forecast is the
// mixture over reads, not a single midpoint distribution.
const pPlace: number[][] = candidates.map(() => new Array<number>(places).fill(0));
for (const h of readH) {
  const temperature = 0.14 + 0.22 * Math.pow(Math.max(0, h), 0.42);
  const strengths = candidates.map((c) => strengthAt(c, h));
  const zMax = Math.max(...strengths);
  const weights = strengths.map((s) => Math.exp((s - zMax) / temperature));
  const q = plCascade(weights);
  candidates.forEach((_, i) => { for (let k = 0; k < places; k++) pPlace[i]![k] = pPlace[i]![k]! + q[i]![k]! / readH.length; });
}

// ---- unnamed share per place: grows with the horizon and the place ----------
const unnamedBase = 0.36 + 0.42 * (1 - Math.exp(-hMid / 5));
const unnamedTarget: number[] = [];
for (let k = 1; k <= places; k++) unnamedTarget.push(clamp(unnamedBase + 0.04 * (k - 1), 0.2, 0.84));

// ---- assemble probability rows ----------------------------------------------
const probabilities: Array<{ mint: string; place: number; p: number }> = [];
const candidateMints = new Set(candidates.map((c) => c.mint));
const gapP0 = 1.0 + 0.1 * sqrtH;
const ageGuardH = Math.min(0.75, 0.45 * histH);
for (let k = 1; k <= places; k++) {
  const namedMass = 1 - unnamedTarget[k - 1]!;
  // Candidate rows: read-averaged PL probabilities scaled to namedMass,
  // rows below 0.0006 dropped and the kept rows rescaled to namedMass.
  const rows: Array<{ mint: string; p: number }> = [];
  candidates.forEach((c, i) => {
    const p = pPlace[i]![k - 1]! * namedMass;
    if (p >= 0.0006) rows.push({ mint: c.mint, p });
  });
  const sumRows = rows.reduce((s, r) => s + r.p, 0);
  if (sumRows > 0) rows.forEach((r) => { r.p = (r.p / sumRows) * namedMass; });
  let rowCount = rows.length;
  const threshold = projPlaceMid[k - 1]!;
  // Tiny rows: mid-tier coins (in the last mark, below the candidates) whose
  // projected cap sits 0.45..gapP0 below this place's projected cap. Naming
  // them at a small honest p removes them from the unnamed pool while
  // keeping a real hedge if one of them does break out.
  const mids = [...byMint.values()]
    .filter((c) => c.inLastMark && !candidateMints.has(c.mint))
    .map((c) => ({ c, gap: threshold - c.projMid }))
    .filter((x) => x.gap >= 0.45 && x.gap < gapP0 && x.c.slope > -0.5)
    .sort((a, b) => a.gap - b.gap || (a.c.mint < b.c.mint ? -1 : 1))
    .slice(0, 20);
  const midMints = new Set(mids.map((x) => x.c.mint));
  for (const x of mids) {
    if (rowCount >= 100) break;
    rows.push({ mint: x.c.mint, p: 0.0012 });
    rowCount++;
  }
  // p = 0 rows, in priority order: zombie chart survivors first (graduated,
  // older, momentum-dead, still ranked — the coins most likely to be on the
  // answer chart diluting the unnamed share), then other coins that would
  // need an extreme surge to hold this place. Fast risers, very volatile
  // coins and brand-new coins are never excluded: their lottery chance is
  // real, and a p = 0 that backfires costs far more than an exclusion earns.
  const eligible = [...byMint.values()]
    .filter((c) => !candidateMints.has(c.mint) && !midMints.has(c.mint))
    .map((c) => ({ c, gap: threshold - c.projMid, ageH: Math.max(0, (cutMs - c.createdMs) / HOUR) }))
    .filter((x) => x.gap > gapP0 && x.c.slope <= 0.8 && x.c.vol <= 0.45 && !(x.ageH < 0.35 && x.c.inLastMark));
  const tierOf = (x: (typeof eligible)[number]): number => {
    const zombie = x.c.inLastMark && (x.c.venue === 'pool' || x.c.complete) && x.c.lastRank >= 20 && x.c.slope <= 0.05 && x.ageH >= ageGuardH;
    if (zombie) return 0;
    if (x.c.inLastMark && x.c.slope <= 0.3 && x.ageH >= ageGuardH) return 1;
    return 2;
  };
  eligible.sort((a, b) => tierOf(a) - tierOf(b) || a.gap - b.gap || (a.c.mint < b.c.mint ? -1 : 1));
  for (const x of eligible) {
    if (rowCount >= 100) break;
    rows.push({ mint: x.c.mint, p: 0 });
    rowCount++;
  }
  rows
    .sort((a, b) => b.p - a.p || (a.mint < b.mint ? -1 : 1))
    .forEach((r) => probabilities.push({ mint: r.mint, place: k, p: Math.round(r.p * MICRO) / MICRO }));
}

// ---- top5: by expected place score under the model --------------------------
const scored = candidates.map((c, i) => ({
  mint: c.mint,
  s: pPlace[i]!.reduce((sum, p, kk) => sum + p * (places - kk), 0),
}));
scored.sort((a, b) => b.s - a.s || (a.mint < b.mint ? -1 : 1));
const top5 = scored.slice(0, places).map((x) => x.mint);
if (top5.length < places) {
  for (const r of lastMark.rows) {
    if (top5.length >= places) break;
    if (!top5.includes(r.mint)) top5.push(r.mint);
  }
}

// ---- sizes: per-read mixture around each place's projected cap --------------
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const above = (x: number, mean: number, sd: number): number => (x === -Infinity ? 1 : x === Infinity ? 0 : 0.5 * erfc((x - mean) / (sd * Math.SQRT2)));
const PLACE_SD_FACTOR = [1.15, 1.05, 1.0, 0.95, 0.9];
const sizes: Array<{ place: number; bin: number; p: number }> = [];
for (let k = 1; k <= places; k++) {
  const resid = placeSeries[k - 1]!.resid;
  const sdFactor = PLACE_SD_FACTOR[k - 1] ?? 1;
  for (let bin = 0; bin <= edges.length; bin++) {
    const lo = bin === 0 ? -Infinity : edges[bin - 1]!;
    const hi = bin === edges.length ? Infinity : edges[bin]!;
    // Average this bin's probability over the answer reads, each read with
    // its own projected mean and horizon-widened spread.
    let pMix = 0;
    for (const h of readH) {
      let mean = placeLogAt(k, h);
      // Keep the places ordered at every read.
      if (k > 1) mean = Math.min(mean, placeLogAt(k - 1, h) - 0.015);
      const sd = (0.2 + 0.11 * Math.sqrt(Math.max(0.05, h)) + 1.3 * resid) * sdFactor;
      const body = above(lo, mean, sd) - above(hi, mean, sd);
      const tail = above(lo, mean + 0.4 - 0.05 * (k - 1), Math.max(sd * 1.8, 0.5)) - above(hi, mean + 0.4 - 0.05 * (k - 1), Math.max(sd * 1.8, 0.5));
      pMix += (0.88 * body + 0.12 * tail) / readH.length;
    }
    const u = Math.floor(pMix * MICRO);
    if (u > 0) sizes.push({ place: k, bin, p: u / MICRO });
  }
}

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, task.output), `${JSON.stringify({ probabilities, top5, sizes })}\n`);
