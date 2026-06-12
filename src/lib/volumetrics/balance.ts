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
  /** UTC hour (0–23). Derived from startedAt for outbound movements (salidas)
   *  and from endedAt for inbound movements (entradas). */
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
 *
 * Classification rule (station-to-station transfer model — SR-009):
 *   - salidas:  volume bucketed by the UTC hour of `startedAt` (dispatch hour).
 *               Every movement contributes a salida when it departs.
 *   - entradas: volume bucketed by the UTC hour of `endedAt` (receipt hour).
 *               Movements with a null/missing `endedAt` are still in transit —
 *               their volume is not yet received, so no entrada is recorded.
 *
 * This model works for the seed data where fromNodeId/toNodeId are station IDs
 * (STA-XXXX), not tank IDs. The old tankIds-based classification produced all-zero
 * bars because no movement node matched a TNK-XXXX ID. SR-009.
 *
 * @param movements - Historical movements to group.
 * @returns Sorted ascending array of hourly balance buckets.
 */
export function groupBalanceByHour(movements: Movement[]): HourlyBalance[] {
  const buckets = new Map<number, { entradas: number; salidas: number }>();

  function ensureBucket(hour: number): { entradas: number; salidas: number } {
    if (!buckets.has(hour)) {
      buckets.set(hour, { entradas: 0, salidas: 0 });
    }
    return buckets.get(hour)!;
  }

  for (const movement of movements) {
    // Salida: always at the dispatch hour
    const dispatchHour = new Date(movement.startedAt).getUTCHours();
    ensureBucket(dispatchHour).salidas += movement.volumeGsvM3;

    // Entrada: only when the movement has completed (endedAt is present)
    if (movement.endedAt) {
      const receiptHour = new Date(movement.endedAt).getUTCHours();
      ensureBucket(receiptHour).entradas += movement.volumeGsvM3;
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
