/**
 * Pure selector functions for the cathodic integrity map module.
 * SR-303 — no side effects, no store imports, no React dependencies.
 * All functions are deterministic given the same inputs.
 */

import type { CathodicReading, PipelineWorld } from "@/lib/domain";
import { AlertLevel } from "@/lib/domain";
import { evaluatePotential, detectDegradationTrend } from "@/lib/integrity/thresholds";

// ============================================================================
// TYPES (const-object + typeof pattern per TypeScript SKILL)
// ============================================================================

/** Trend indicator for a cathodic point's potential history. */
export const TrendFlag = {
  /** Fewer than 3 readings — no degrading signal. */
  NEUTRAL: "—",
  /** ≥3 readings with strictly increasing potentialV (deteriorating protection). */
  DEGRADING: "↘",
} as const;
export type TrendFlag = (typeof TrendFlag)[keyof typeof TrendFlag];

/** KPI counts for the three alert levels, one per unique cathodic point. */
export interface IntegrityKpis {
  readonly ok: number;
  readonly warning: number;
  readonly critical: number;
}

/** A single data point in a reading time series (for charts and sparklines). */
export interface ReadingSeriesPoint {
  readonly timestamp: Date;
  readonly potentialV: number;
}

/** One row in the readings table — one per unique km:segmentId point. */
export interface ReadingTableRow {
  /** Composite key "km:segmentId". Also used as selection id. */
  readonly pointKey: string;
  readonly km: number;
  readonly segmentId: string;
  /** potentialV from the most-recent reading (by takenAt). */
  readonly latestPotentialV: number;
  /** Alert level from evaluatePotential(latestPotentialV). */
  readonly level: AlertLevel;
  /** All readings for this point sorted ascending by takenAt. */
  readonly sparkleSeries: ReadonlyArray<ReadingSeriesPoint>;
  /** Trend flag: NEUTRAL if <3 readings, DEGRADING if detectDegradationTrend is true. */
  readonly trend: TrendFlag;
}

// ============================================================================
// COMPOSITE KEY HELPERS
// ============================================================================

/**
 * Build the composite point key "km:segmentId".
 * km is rounded to 1 decimal place to prevent float-precision key mismatches.
 * This is the surrogate identity for a logical cathodic protection point.
 */
export function pointKey(km: number, segmentId: string): string {
  return `${Math.round(km * 10) / 10}:${segmentId}`;
}

/**
 * Parse a composite point key back into its components.
 * Assumes format "km:segmentId" where km is the numeric portion before the first colon.
 */
export function parsePointKey(key: string): { km: number; segmentId: string } {
  const colonIdx = key.indexOf(":");
  return {
    km: Number(key.slice(0, colonIdx)),
    segmentId: key.slice(colonIdx + 1),
  };
}

// ============================================================================
// SELECTORS
// ============================================================================

/**
 * Compute KPI counts per unique cathodic point.
 *
 * ORCHESTRATOR DECISION: counts ONE unit per unique km:segmentId point,
 * classified by evaluatePotential applied to the most-recent reading's
 * potentialV. KPI totals MUST equal buildReadingTableRows().length.
 *
 * @param readings - All cathodic readings from the world
 */
export function computeIntegrityKpis(readings: CathodicReading[]): IntegrityKpis {
  if (readings.length === 0) {
    return { ok: 0, warning: 0, critical: 0 };
  }

  // Group by composite key
  const groups = groupReadingsByKm(readings);

  let ok = 0;
  let warning = 0;
  let critical = 0;

  for (const groupReadings of groups.values()) {
    // Take the most-recent reading by takenAt
    const sorted = [...groupReadings].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    const latest = sorted[sorted.length - 1];
    const level = evaluatePotential(latest.potentialV);

    switch (level) {
      case AlertLevel.OK:
        ok++;
        break;
      case AlertLevel.WARNING:
        warning++;
        break;
      case AlertLevel.CRITICAL:
        critical++;
        break;
      default:
        throw new Error(`Unknown alert level: ${level}`);
    }
  }

  return { ok, warning, critical };
}

/**
 * Group readings by composite key "km:segmentId".
 * Readings at the same km but different segmentIds are in separate groups.
 *
 * @param readings - All cathodic readings
 * @returns Map keyed by composite point key
 */
export function groupReadingsByKm(
  readings: CathodicReading[],
): Map<string, CathodicReading[]> {
  const groups = new Map<string, CathodicReading[]>();
  for (const r of readings) {
    const key = pointKey(r.km, r.segmentId);
    const existing = groups.get(key);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(key, [r]);
    }
  }
  return groups;
}

/**
 * Build one ReadingTableRow per unique km:segmentId point from a readings array.
 * Rows are sorted by km ascending.
 *
 * Level is computed fresh from evaluatePotential(latestPotentialV) so the
 * displayed level always matches the displayed potential (spec §5, SR-303 §5).
 *
 * Prefer this overload when you already have a filtered or scoped readings slice
 * (e.g., readings pre-filtered by stationId). Avoids monkey-patching the world.
 *
 * @param readings - Array of cathodic readings to process
 */
export function buildReadingTableRowsFromReadings(readings: CathodicReading[]): ReadingTableRow[] {
  const groups = groupReadingsByKm(readings);
  const rows: ReadingTableRow[] = [];

  for (const [key, groupReadings] of groups.entries()) {
    const parsed = parsePointKey(key);

    // Sort ascending by takenAt for consistent ordering
    const sorted = [...groupReadings].sort((a, b) => a.takenAt.localeCompare(b.takenAt));

    const latestReading = sorted[sorted.length - 1];
    const latestPotentialV = latestReading.potentialV;
    const level = evaluatePotential(latestPotentialV);

    const sparkleSeries: ReadingSeriesPoint[] = sorted.map((r) => ({
      timestamp: new Date(r.takenAt),
      potentialV: r.potentialV,
    }));

    const trend: TrendFlag = detectDegradationTrend(sorted)
      ? TrendFlag.DEGRADING
      : TrendFlag.NEUTRAL;

    rows.push({
      pointKey: key,
      km: parsed.km,
      segmentId: parsed.segmentId,
      latestPotentialV,
      level,
      sparkleSeries,
      trend,
    });
  }

  // Sort rows by km ascending
  rows.sort((a, b) => a.km - b.km);

  return rows;
}

/**
 * Build one ReadingTableRow per unique km:segmentId point.
 * Rows are sorted by km ascending.
 *
 * Level is computed fresh from evaluatePotential(latestPotentialV) so the
 * displayed level always matches the displayed potential (spec §5, SR-303 §5).
 *
 * @param world - Full pipeline world (uses world.cathodicReadings)
 */
export function buildReadingTableRows(world: PipelineWorld): ReadingTableRow[] {
  return buildReadingTableRowsFromReadings(world.cathodicReadings);
}

/**
 * Extract the time-ordered reading series for a single cathodic point.
 * Used by ReadingDetail to feed TimeSeriesChart.
 *
 * @param readings - All cathodic readings from the world
 * @param key - Composite point key "km:segmentId"
 * @returns Readings for the point sorted ascending by takenAt, or [] if no match
 */
export function extractReadingSeriesForChart(
  readings: CathodicReading[],
  key: string,
): ReadingSeriesPoint[] {
  // CRITICAL-3: use pointKey() helper (which rounds km) so float-imprecise values match correctly.
  // A raw template literal `${r.km}:${r.segmentId}` silently fails for km values like 96.79999999.
  const filtered = readings.filter((r) => pointKey(r.km, r.segmentId) === key);

  if (filtered.length === 0) {
    return [];
  }

  // SUGGESTION-1: use Date.parse for robustness — localeCompare breaks on non-UTC offset strings.
  const sorted = [...filtered].sort(
    (a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt),
  );

  return sorted.map((r) => ({
    timestamp: new Date(r.takenAt),
    potentialV: r.potentialV,
  }));
}
