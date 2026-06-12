/**
 * Cathodic protection threshold evaluation.
 * Implements DOMAIN_RULES.md §5.
 * All functions are pure — no side effects.
 */

import { CATHODIC_OK, CATHODIC_WARN, CATHODIC_OVERPROTECT, AlertLevel } from "@/lib/domain";
import type { CathodicReading } from "@/lib/domain";

/**
 * Evaluate a cathodic potential reading against protection thresholds.
 *
 * Threshold logic (§5.1 and §5.2):
 * - potentialV ≤ CATHODIC_OVERPROTECT (-1.200 V): WARNING (overprotection)
 * - CATHODIC_OVERPROTECT < potentialV ≤ CATHODIC_OK (-0.850 V): OK (well protected)
 * - CATHODIC_OK < potentialV ≤ CATHODIC_WARN (-0.750 V): WARNING (marginal)
 * - potentialV > CATHODIC_WARN (-0.750 V): CRITICAL (underprotected)
 *
 * Note: potentials are negative; "more negative" = "more protected".
 *
 * @param potentialV - Measured potential in Volts (expected to be negative)
 * @returns AlertLevel classification
 */
export function evaluatePotential(potentialV: number): AlertLevel {
  // Overprotection: too negative
  if (potentialV <= CATHODIC_OVERPROTECT) {
    return AlertLevel.WARNING;
  }
  // Well protected: at or below OK threshold (≤ -0.850 V)
  if (potentialV <= CATHODIC_OK) {
    return AlertLevel.OK;
  }
  // Marginal protection: between -0.850 V and -0.750 V
  if (potentialV <= CATHODIC_WARN) {
    return AlertLevel.WARNING;
  }
  // Underprotected: above -0.750 V (less negative / closer to 0)
  return AlertLevel.CRITICAL;
}

/**
 * Detect a degradation trend in cathodic readings.
 * Returns true if the last 3 readings show a monotonically increasing potential
 * (i.e., readings become less negative, indicating worsening protection).
 * §5.3
 *
 * Readings should be sorted in any order; this function uses `takenAt` to
 * identify the last 3 by chronological order (ascending).
 *
 * @param readings - Array of CathodicReading objects (may be unsorted)
 * @returns true if the last 3 readings are strictly monotonically increasing
 */
export function detectDegradationTrend(readings: CathodicReading[]): boolean {
  if (readings.length < 3) {
    return false;
  }

  // Sort by takenAt ascending to get chronological order
  const sorted = [...readings].sort((a, b) => a.takenAt.localeCompare(b.takenAt));

  const last3 = sorted.slice(-3);
  const [first, second, third] = last3;

  // Strictly monotonically increasing (less negative = degrading)
  return first.potentialV < second.potentialV && second.potentialV < third.potentialV;
}
