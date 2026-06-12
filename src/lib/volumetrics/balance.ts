/**
 * Volumetric balance computations for tanks.
 * Implements DOMAIN_RULES.md §2.
 * All functions are pure — no side effects.
 */

import { BALANCE_TOLERANCE_OK, BALANCE_TOLERANCE_WARN, AlertLevel } from "@/lib/domain";

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
