/**
 * Intraday sector correlation computation for the /regime page.
 *
 * Accumulates a rolling buffer of intraday price snapshots for the 11 SPDR
 * sector ETFs. Once we have ≥ MIN_SNAPSHOTS observations for all 11 ETFs,
 * we compute the average pairwise Pearson correlation of their price-return
 * series — an intraday proxy for the 20-day rolling correlation used by CRI.
 */

import type { PriceData } from "./pricesProtocol";

export const SECTOR_ETFS = [
  "XLB", "XLC", "XLE", "XLF", "XLI",
  "XLK", "XLP", "XLRE", "XLU", "XLV", "XLY",
] as const;

export type SectorEtf = typeof SECTOR_ETFS[number];

/** Minimum snapshots required before we emit an intraday correlation value. */
const MIN_SNAPSHOTS = 10;

/** Maximum buffer size — older snapshots are discarded. */
const MAX_SNAPSHOTS = 60;

/* ─── Module-level rolling buffer (shared across hook calls) ─────────────── */
// Each entry is a map from ETF symbol → price at that snapshot moment.
// Buffer grows up to MAX_SNAPSHOTS; oldest entries are dropped.
const priceBuffer: Array<Partial<Record<SectorEtf, number>>> = [];

/** Append a new snapshot to the rolling buffer. Call whenever prices update. */
export function appendSnapshot(prices: Record<string, PriceData>): void {
  const snapshot: Partial<Record<SectorEtf, number>> = {};
  let anyValid = false;

  for (const etf of SECTOR_ETFS) {
    const p = prices[etf];
    if (p?.last != null && Number.isFinite(p.last)) {
      snapshot[etf] = p.last;
      anyValid = true;
    }
  }

  if (!anyValid) return;

  priceBuffer.push(snapshot);
  if (priceBuffer.length > MAX_SNAPSHOTS) {
    priceBuffer.shift();
  }
}

/** Reset the buffer — useful when leaving the /regime page. */
export function resetBuffer(): void {
  priceBuffer.length = 0;
}

/* ─── Pearson correlation of two equal-length arrays ────────────────────── */

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;

  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  const denom = Math.sqrt(varA * varB);
  if (denom === 0) return 0;
  return cov / denom;
}

/* ─── Main computation ───────────────────────────────────────────────────── */

/**
 * Compute the average pairwise Pearson correlation across the 11 sector ETFs
 * from the accumulated intraday price buffer.
 *
 * Returns `null` when:
 * - Fewer than MIN_SNAPSHOTS snapshots have been collected, OR
 * - Any ETF has fewer than MIN_SNAPSHOTS valid price observations
 */
export function computeIntradaySectorCorr(): number | null {
  if (priceBuffer.length < MIN_SNAPSHOTS) return null;

  // Build a series per ETF from the buffer — only include snapshots where the
  // ETF has a valid price reading.
  const series: Record<string, number[]> = {};
  for (const etf of SECTOR_ETFS) {
    series[etf] = [];
  }

  // We need an aligned series — only use rows where ALL ETFs have a price,
  // so all series are the same length for valid Pearson computation.
  const alignedRows: Array<Record<SectorEtf, number>> = [];
  for (const snapshot of priceBuffer) {
    let complete = true;
    for (const etf of SECTOR_ETFS) {
      if (snapshot[etf] == null) { complete = false; break; }
    }
    if (complete) {
      alignedRows.push(snapshot as Record<SectorEtf, number>);
    }
  }

  if (alignedRows.length < MIN_SNAPSHOTS) return null;

  // Convert price levels to period-over-period returns.
  if (alignedRows.length < 2) return null;

  const returns: Record<SectorEtf, number[]> = {} as Record<SectorEtf, number[]>;
  for (const etf of SECTOR_ETFS) {
    returns[etf] = [];
  }

  for (let i = 1; i < alignedRows.length; i++) {
    for (const etf of SECTOR_ETFS) {
      const prev = alignedRows[i - 1][etf];
      const curr = alignedRows[i][etf];
      // Simple arithmetic return
      returns[etf].push(prev !== 0 ? (curr - prev) / prev : 0);
    }
  }

  const returnLen = alignedRows.length - 1;
  if (returnLen < MIN_SNAPSHOTS - 1) return null;

  // Compute all 55 pairwise correlations and average them.
  let total = 0;
  let pairs = 0;

  for (let i = 0; i < SECTOR_ETFS.length; i++) {
    for (let j = i + 1; j < SECTOR_ETFS.length; j++) {
      const etfA = SECTOR_ETFS[i];
      const etfB = SECTOR_ETFS[j];
      total += pearson(returns[etfA], returns[etfB]);
      pairs++;
    }
  }

  if (pairs === 0) return null;
  return total / pairs;
}

/** How many aligned (all-ETF) snapshots are currently buffered. */
export function bufferDepth(): number {
  return priceBuffer.filter((snapshot) =>
    SECTOR_ETFS.every((etf) => snapshot[etf] != null)
  ).length;
}
