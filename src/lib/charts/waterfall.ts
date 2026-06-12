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
