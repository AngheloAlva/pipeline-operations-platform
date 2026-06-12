/**
 * Volumetric balance computations for tanks.
 * Implements DOMAIN_RULES.md §2.
 * All functions are pure — no side effects.
 */

import { BALANCE_TOLERANCE_OK, BALANCE_TOLERANCE_WARN, AlertLevel } from "@/lib/domain";
import type { Movement } from "@/lib/domain";

/** Parameters for computing a volumetric balance. */
export interface BalanceParams {
  /** Initial stock volume in m³. */
  initial: number;
  /** Array of input volumes (receptions, inbound transfers) in m³. */
  inputs: number[];
  /** Array of output volumes (transfers out, deliveries) in m³. */
  outputs: number[];
  /** Measured final stock volume in m³. */
  measured: number;
}

/** Result of a volumetric balance computation. */
export interface BalanceResult {
  /** Theoretically calculated final stock (initial + inputs - outputs). */
  calculated: number;
  /** Measured final stock. */
  measured: number;
  /** Difference: measured - calculated. Positive means surplus, negative means deficit. */
  difference: number;
  /** Absolute percentage discrepancy relative to calculated volume. */
  percentage: number;
  /** Alert level based on tolerance thresholds. */
  level: AlertLevel;
}

/**
 * Compute the volumetric balance for a tank or system.
 * Equation: calculated = initial + Σ(inputs) - Σ(outputs)
 * §2.1
 */
export function computeBalance(params: BalanceParams): BalanceResult {
  const { initial, inputs, outputs, measured } = params;

  const totalIn = inputs.reduce((acc, v) => acc + v, 0);
  const totalOut = outputs.reduce((acc, v) => acc + v, 0);
  const calculated = initial + totalIn - totalOut;

  const difference = measured - calculated;

  // When calculated stock is zero but measured is non-zero, the discrepancy
  // is undefined as a percentage — classify as CRITICAL to surface the anomaly.
  if (calculated === 0 && measured !== 0) {
    return { calculated, measured, difference, percentage: 0, level: AlertLevel.CRITICAL };
  }

  // Percentage relative to calculated stock; guard against 0/0 (both zero = OK, 0%)
  const percentage = calculated !== 0 ? Math.abs(difference / calculated) * 100 : 0;

  let level: AlertLevel;
  if (percentage <= BALANCE_TOLERANCE_OK) {
    level = AlertLevel.OK;
  } else if (percentage <= BALANCE_TOLERANCE_WARN) {
    level = AlertLevel.WARNING;
  } else {
    level = AlertLevel.CRITICAL;
  }

  return { calculated, measured, difference, percentage, level };
}

/**
 * Convert tank height in mm to volume in m³ using a linear gauge factor.
 * volume = heightMm × gaugeFactor
 * §2.3
 *
 * @param heightMm - Column height in mm
 * @param gaugeFactor - Conversion factor in m³/mm (capacity / maxHeightMm)
 */
export function tankHeightToVolume(heightMm: number, gaugeFactor: number): number {
  return heightMm * gaugeFactor;
}

/**
 * Convert tank volume in m³ to column height in mm using a linear gauge factor.
 * heightMm = volumeM3 / gaugeFactor
 * §2.3
 *
 * @param volumeM3 - Volume in m³
 * @param gaugeFactor - Conversion factor in m³/mm
 */
export function tankVolumeToHeight(volumeM3: number, gaugeFactor: number): number {
  return volumeM3 / gaugeFactor;
}

// ============================================================================
// groupBalanceByHour
// ============================================================================

/** One hour bucket in the hourly balance series. SR-009. */
export interface HourlyBalance {
  /** UTC hour (0–23) from the movement's startedAt. */
  hour: number;
  /** Total inbound volume in m³ for this hour. */
  entradas: number;
  /** Total outbound volume in m³ for this hour. */
  salidas: number;
  /** Net stock change: entradas − salidas. */
  deltaStock: number;
}

/**
 * Group historical movements by UTC hour and compute per-hour balance.
 * Movements are bucketed by the hour of their `startedAt` timestamp.
 *
 * Classification rule (domain choice — documented):
 *   - entradas: movement whose `toNodeId` is in `tankIds` (fluid entering a tank).
 *   - salidas:  movement whose `fromNodeId` is in `tankIds` (fluid leaving a tank).
 *   - Tank-to-tank: counted as both entrada and salida — the receiving tank
 *     records an entrada and the sending tank records a salida. This preserves
 *     per-tank conservation without double-counting at system level when the
 *     caller filters to a single tank's tankIds set.
 *   - Station-to-station (neither node is a tank): volume is not attributed to
 *     either bucket (transit-only movement, no tank stock change).
 *
 * The former `toNodeId.startsWith("T-")` heuristic only matched tank TAGs
 * (e.g. "T-6010") but the generator uses tank IDs ("TNK-XXXX"), making all
 * entradas zero with real data. SR-009.
 *
 * @param movements - Historical movements to group.
 * @param tankIds   - Set of tank node IDs (e.g. "TNK-0010") used for classification.
 * @returns Sorted ascending array of hourly balance buckets.
 */
export function groupBalanceByHour(
  movements: Movement[],
  tankIds: ReadonlySet<string>,
): HourlyBalance[] {
  const buckets = new Map<number, { entradas: number; salidas: number }>();

  for (const movement of movements) {
    const hour = new Date(movement.startedAt).getUTCHours();

    if (!buckets.has(hour)) {
      buckets.set(hour, { entradas: 0, salidas: 0 });
    }

    const bucket = buckets.get(hour)!;

    const toIsTank = tankIds.has(movement.toNodeId);
    const fromIsTank = tankIds.has(movement.fromNodeId);

    if (toIsTank) {
      bucket.entradas += movement.volumeGsvM3;
    }
    if (fromIsTank) {
      bucket.salidas += movement.volumeGsvM3;
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, { entradas, salidas }]) => ({
      hour,
      entradas,
      salidas,
      deltaStock: entradas - salidas,
    }));
}
