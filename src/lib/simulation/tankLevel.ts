/**
 * Tank fill-level alert classification.
 * Shared by CommandRail (master status) and AnnunciatorPanel (per-station cells)
 * so the high-level alarm thresholds stay defined in exactly one place.
 * Pure — no side effects, no store/React dependencies.
 */

import { TANK_HIGH_LEVEL_ALARM, AlertLevel } from "@/lib/domain";

/**
 * Pre-alarm band width below the high-level alarm: a tank within this margin of
 * TANK_HIGH_LEVEL_ALARM is WARNING (precaución), not yet CRITICAL.
 */
export const TANK_PRE_ALARM_BAND = 0.1;

/**
 * Map a tank fill ratio (level / capacity, 0–1) to an alert level.
 *   ratio ≥ TANK_HIGH_LEVEL_ALARM                      → CRITICAL
 *   ratio ≥ TANK_HIGH_LEVEL_ALARM − TANK_PRE_ALARM_BAND → WARNING
 *   otherwise                                          → OK
 */
export function tankRatioToLevel(ratio: number): AlertLevel {
  if (ratio >= TANK_HIGH_LEVEL_ALARM) return AlertLevel.CRITICAL;
  if (ratio >= TANK_HIGH_LEVEL_ALARM - TANK_PRE_ALARM_BAND) return AlertLevel.WARNING;
  return AlertLevel.OK;
}
