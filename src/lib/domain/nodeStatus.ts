/**
 * Node status resolution for hero-diagram nodes (MV-5).
 * Combines equipment operability, overdue work orders, and cathodic
 * protection readings into a single per-node operational status.
 * All functions are pure — no side effects.
 */

import { AlertLevel, WorkOrderStatus } from "./types";
import type { CathodicReading, PipelineWorld } from "./types";

/** Operational status of a diagram node, ordered by severity. */
export const NodeStatus = {
  /** Normal operation. */
  OK: "OK",
  /** An open work order is past its program date — work permit in force. */
  PERMIT: "PERMIT",
  /** Equipment at the node is locked out (non-operational). */
  LOTO: "LOTO",
  /** Latest cathodic protection reading at the node is CRITICAL. */
  ALERT: "ALERT",
} as const;
export type NodeStatus = (typeof NodeStatus)[keyof typeof NodeStatus];

/** Work order statuses considered open (not terminal). */
const OPEN_WO_STATUSES = new Set<string>([
  WorkOrderStatus.PLANNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
]);

/**
 * Return the latest reading (by takenAt) for each distinct km point
 * in the given station-scoped reading list.
 */
function latestReadingPerPoint(readings: CathodicReading[]): CathodicReading[] {
  const latestByKm = new Map<number, CathodicReading>();
  for (const reading of readings) {
    const current = latestByKm.get(reading.km);
    if (!current || reading.takenAt > current.takenAt) {
      latestByKm.set(reading.km, reading);
    }
  }
  return [...latestByKm.values()];
}

/**
 * Resolve the operational status of a diagram node (station or tank).
 *
 * Severity precedence: ALERT > LOTO > PERMIT > OK.
 * - ALERT: the latest cathodic reading at any km point of the station is CRITICAL.
 * - LOTO: any equipment at the station is non-operational (locked out).
 * - PERMIT: any open work order at the station is past its program date.
 * - OK: none of the above (also returned for unknown node ids).
 *
 * @param world - Full pipeline world state
 * @param nodeId - Station id, or tank id (resolved to its station)
 * @param now - Current date as ISO string (YYYY-MM-DD) for overdue checks
 */
export function resolveNodeStatus(world: PipelineWorld, nodeId: string, now: string): NodeStatus {
  // Resolve tank ids to their owning station
  const tank = world.tanks.find((t) => t.id === nodeId);
  const stationId = tank ? tank.stationId : nodeId;

  // ALERT: latest cathodic reading per km point at this station is CRITICAL
  const stationReadings = world.cathodicReadings.filter((r) => r.stationId === stationId);
  const hasCriticalReading = latestReadingPerPoint(stationReadings).some(
    (r) => r.level === AlertLevel.CRITICAL,
  );
  if (hasCriticalReading) return NodeStatus.ALERT;

  // LOTO: non-operational equipment at this station
  const hasLockedOutEquipment = world.equipment.some(
    (e) => e.stationId === stationId && !e.isOperational,
  );
  if (hasLockedOutEquipment) return NodeStatus.LOTO;

  // PERMIT: open work order past its program date (YYYY-MM-DD string compare)
  const hasOverdueWorkOrder = world.workOrders.some(
    (wo) => wo.stationId === stationId && OPEN_WO_STATUSES.has(wo.status) && wo.programDate < now,
  );
  if (hasOverdueWorkOrder) return NodeStatus.PERMIT;

  return NodeStatus.OK;
}
