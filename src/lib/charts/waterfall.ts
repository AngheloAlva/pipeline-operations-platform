/**
 * Waterfall chart data shaping helpers.
 * Pure functions — no side effects, no store imports, no React dependencies.
 * SR-010: TRUE per-shipper cumulative waterfall (real − programa).
 * Used by WaterfallChart component with Recharts ComposedChart + Cell.
 */

import { computeCompliance } from "@/lib/volumetrics/compliance";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";

// ============================================================================
// TYPES
// ============================================================================

/** Input for a single shipper's waterfall data point. */
export interface WaterfallInput {
  shipperId: string;
  /** Human-readable shipper name. */
  name: string;
  real: number;
  programa: number;
  presupuesto: number;
}

/**
 * A single bar in the waterfall chart.
 * `base` is the invisible stack base (cumulative running total before this entry).
 * `waterfallDelta` is the visible bar length (real − programa).
 * Recharts ComposedChart renders two stacked bars: invisible `base` + visible `waterfallDelta`.
 */
export interface WaterfallEntry {
  shipperId: string;
  /** Display label on the X-axis (shipper short name). */
  label: string;
  /** Signed delta: real − programa. Positive = ahead, negative = behind. */
  waterfallDelta: number;
  /** Cumulative base before this bar (for invisible stack bar). */
  base: number;
  /** Compliance band for Cell color selection. */
  band: ComplianceBand;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a single WaterfallEntry for a shipper WITHOUT cumulative base.
 * Base is always 0 — use `buildWaterfallData` to get proper cumulative bases.
 * Exported primarily for unit testing individual entries.
 */
export function buildWaterfallEntry(
  shipperId: string,
  name: string,
  real: number,
  programa: number,
  presupuesto: number,
): WaterfallEntry {
  const compliance = computeCompliance({ shipperId, real, programa, presupuesto });

  return {
    shipperId,
    label: name,
    waterfallDelta: compliance.waterfallDelta,
    base: 0,
    band: compliance.band,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build the full waterfall dataset with cumulative bases for Recharts.
 *
 * Algorithm:
 *   running = 0
 *   for each shipper:
 *     entry.base = running
 *     entry.waterfallDelta = real − programa
 *     running += entry.waterfallDelta
 *
 * Recharts ComposedChart renders:
 *   - An invisible bar of height `base` (no fill / opacity 0)
 *   - A visible bar of height `waterfallDelta` stacked on top
 *
 * SR-010 req 3–4, 7.
 */
export function buildWaterfallData(inputs: WaterfallInput[]): WaterfallEntry[] {
  let running = 0;

  return inputs.map(({ shipperId, name, real, programa, presupuesto }) => {
    const base = running;
    const entry = buildWaterfallEntry(shipperId, name, real, programa, presupuesto);
    running += entry.waterfallDelta;

    return { ...entry, base };
  });
}

/**
 * Format a Y-axis tick for waterfall charts (MV-20).
 *
 * Small magnitudes (|value| < 1000) render as plain integers ("250", "-177")
 * instead of the degenerate "0k"/"-0k" a fixed ÷1000 formatter produces.
 * Thousands render compact: whole thousands as "5k", non-whole with one
 * es-AR decimal ("1,5k") so adjacent ticks never collapse into duplicates.
 */
export function formatWaterfallTick(value: number): string {
  if (Math.abs(value) < 1000) {
    // Math.round(-0.4) yields -0; normalize so the tick reads "0".
    return `${Math.round(value) + 0}`;
  }

  const thousands = value / 1000;
  const rounded = Math.round(thousands * 10) / 10;
  const label = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${label}k`;
}

/** Input for a waterfall bar whose delta and band are already computed (MV-15). */
export interface WaterfallDeltaInput {
  shipperId: string;
  /** Display label on the X-axis. */
  label: string;
  /** Signed delta for the bar (e.g. custody diffM3). */
  delta: number;
  /** Semantic band for Cell color selection. */
  band: ComplianceBand;
}

/**
 * Build waterfall entries with cumulative bases from pre-computed deltas.
 * Unlike buildWaterfallData, no compliance is derived — callers supply the
 * delta and band (used for custody differences, MV-15).
 */
export function buildWaterfallFromDeltas(inputs: WaterfallDeltaInput[]): WaterfallEntry[] {
  let running = 0;

  return inputs.map(({ shipperId, label, delta, band }) => {
    const base = running;
    running += delta;
    return { shipperId, label, waterfallDelta: delta, base, band };
  });
}
