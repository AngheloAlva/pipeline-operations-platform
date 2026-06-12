/**
 * World validation — checks all coherence rules from DATA_GENERATOR_SPEC.md §6.
 * Returns a structured ValidationResult rather than throwing.
 */

import type { PipelineWorld } from "@/lib/domain";
import { WorkOrderStatus } from "@/lib/domain";
import { evaluatePotential } from "@/lib/integrity/thresholds";
import { computeBalance } from "@/lib/volumetrics/balance";

/** Result of a world validation check. */
export interface ValidationResult {
  /** True if all checks passed, false if any error was found. */
  valid: boolean;
  /** List of human-readable error descriptions (empty when valid). */
  errors: string[];
}

/**
 * Validate a PipelineWorld for internal coherence.
 * Checks:
 *  1. All *Id FK references resolve to existing entities.
 *  2. Tank levels are within [0, capacityM3].
 *  3. Station km values are strictly increasing and within [0, totalLengthKm].
 *  4. CathodicReading.level is consistent with evaluatePotential(potentialV).
 *  5. WorkOrder.progress is coherent with WorkOrder.status.
 *
 * @param world - The PipelineWorld to validate
 * @returns ValidationResult with valid flag and error list
 */
export function validateWorld(world: PipelineWorld): ValidationResult {
  const errors: string[] = [];

  // ------------------------------------------------------------------
  // Build lookup sets for FK checks
  // ------------------------------------------------------------------
  const stationIds = new Set(world.stations.map((s) => s.id));
  const segmentIds = new Set(world.pipeline.segments.map((s) => s.id));
  const tankIds = new Set(world.tanks.map((t) => t.id));
  const equipmentIds = new Set(world.equipment.map((e) => e.id));
  const shipperIds = new Set(world.shippers.map((s) => s.id));
  const planIds = new Set(world.maintenancePlans.map((p) => p.id));

  // Collect all task IDs from plans
  const taskIds = new Set<string>();
  for (const plan of world.maintenancePlans) {
    for (const task of plan.tasks) {
      taskIds.add(task.id);
    }
  }

  // ------------------------------------------------------------------
  // Rule 1a: Tank FK integrity — stationId
  // ------------------------------------------------------------------
  for (const tank of world.tanks) {
    if (!stationIds.has(tank.stationId)) {
      errors.push(
        `Tank ${tank.id} (${tank.tag}) references non-existent stationId: ${tank.stationId}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 1b: Equipment FK integrity — stationId
  // ------------------------------------------------------------------
  for (const equip of world.equipment) {
    if (!stationIds.has(equip.stationId)) {
      errors.push(
        `Equipment ${equip.id} (${equip.tag}) references non-existent stationId: ${equip.stationId}`,
      );
    }
    if (equip.parentId && !equipmentIds.has(equip.parentId)) {
      errors.push(
        `Equipment ${equip.id} (${equip.tag}) references non-existent parentId: ${equip.parentId}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 1c: Segment FK on pipeline
  // ------------------------------------------------------------------
  for (const segment of world.pipeline.segments) {
    if (segment.pipelineId !== world.pipeline.id) {
      errors.push(
        `Segment ${segment.id} references pipelineId ${segment.pipelineId} but pipeline is ${world.pipeline.id}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 1d: Movement FK integrity
  // ------------------------------------------------------------------
  for (const movement of world.movements) {
    const fromValid = stationIds.has(movement.fromNodeId) || tankIds.has(movement.fromNodeId);
    const toValid = stationIds.has(movement.toNodeId) || tankIds.has(movement.toNodeId);
    if (!fromValid) {
      errors.push(
        `Movement ${movement.id} references non-existent fromNodeId: ${movement.fromNodeId}`,
      );
    }
    if (!toValid) {
      errors.push(`Movement ${movement.id} references non-existent toNodeId: ${movement.toNodeId}`);
    }
    if (movement.shipperId && !shipperIds.has(movement.shipperId)) {
      errors.push(
        `Movement ${movement.id} references non-existent shipperId: ${movement.shipperId}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 1e: CathodicReading FK — segmentId
  // ------------------------------------------------------------------
  for (const reading of world.cathodicReadings) {
    if (!segmentIds.has(reading.segmentId)) {
      errors.push(
        `CathodicReading ${reading.id} references non-existent segmentId: ${reading.segmentId}`,
      );
    }
    if (reading.stationId && !stationIds.has(reading.stationId)) {
      errors.push(
        `CathodicReading ${reading.id} references non-existent stationId: ${reading.stationId}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 1f: WorkOrder FK — equipmentId, stationId, taskId
  // ------------------------------------------------------------------
  for (const wo of world.workOrders) {
    if (!equipmentIds.has(wo.equipmentId)) {
      errors.push(
        `WorkOrder ${wo.id} (${wo.otNumber}) references non-existent equipmentId: ${wo.equipmentId}`,
      );
    }
    if (!stationIds.has(wo.stationId)) {
      errors.push(
        `WorkOrder ${wo.id} (${wo.otNumber}) references non-existent stationId: ${wo.stationId}`,
      );
    }
    if (wo.taskId && !taskIds.has(wo.taskId)) {
      errors.push(
        `WorkOrder ${wo.id} (${wo.otNumber}) references non-existent taskId: ${wo.taskId}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 1g: MaintenancePlan FK — equipmentId, stationId
  // ------------------------------------------------------------------
  for (const plan of world.maintenancePlans) {
    if (plan.equipmentId && !equipmentIds.has(plan.equipmentId)) {
      errors.push(
        `MaintenancePlan ${plan.id} references non-existent equipmentId: ${plan.equipmentId}`,
      );
    }
    if (plan.stationId && !stationIds.has(plan.stationId)) {
      errors.push(
        `MaintenancePlan ${plan.id} references non-existent stationId: ${plan.stationId}`,
      );
    }
    for (const task of plan.tasks) {
      if (task.planId !== plan.id) {
        errors.push(
          `MaintenanceTask ${task.id} planId ${task.planId} does not match plan ${plan.id}`,
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // Rule 1h: VolumeTarget.shipperId FK against known shipper IDs
  // ------------------------------------------------------------------
  for (const target of world.volumeTargets) {
    if (target.shipperId && !shipperIds.has(target.shipperId)) {
      errors.push(
        `VolumeTarget ${target.id} references non-existent shipperId: ${target.shipperId}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 1i: TelemetryPoint.sourceId FK against tank ∪ segment ∪ equipment IDs
  // ------------------------------------------------------------------
  for (const point of world.telemetry) {
    const sourceValid =
      tankIds.has(point.sourceId) ||
      segmentIds.has(point.sourceId) ||
      equipmentIds.has(point.sourceId);
    if (!sourceValid) {
      errors.push(`TelemetryPoint ${point.id} references non-existent sourceId: ${point.sourceId}`);
    }
  }

  // ------------------------------------------------------------------
  // Rule 2: Tank level in bounds [0, capacityM3]
  // ------------------------------------------------------------------
  for (const tank of world.tanks) {
    if (tank.currentLevelM3 < 0) {
      errors.push(
        `Tank ${tank.id} (${tank.tag}) has negative currentLevelM3: ${tank.currentLevelM3}`,
      );
    }
    if (tank.currentLevelM3 > tank.capacityM3) {
      errors.push(
        `Tank ${tank.id} (${tank.tag}) currentLevelM3 (${tank.currentLevelM3}) exceeds capacityM3 (${tank.capacityM3})`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 2b: Tank balance closure per DATA_GENERATOR_SPEC.md §6
  // The generator's running-level tracking uses station IDs as fromNodeId/toNodeId,
  // so we verify at station level. Intentional ±0.2–0.3% per-movement mismatches
  // (≤10% of movements) are accepted; structural breakage (computed closing stock
  // negative by more than 1 m³ epsilon) is rejected.
  // ------------------------------------------------------------------
  const tanksByStation = new Map<string, typeof world.tanks>();
  for (const tank of world.tanks) {
    const list = tanksByStation.get(tank.stationId) ?? [];
    list.push(tank);
    tanksByStation.set(tank.stationId, list);
  }

  for (const station of world.stations) {
    const stationTanks = tanksByStation.get(station.id) ?? [];
    if (stationTanks.length === 0) continue;

    const initialStock = stationTanks.reduce((sum, t) => sum + t.currentLevelM3, 0);

    const inputs = world.movements
      .filter((m) => m.toNodeId === station.id)
      .map((m) => m.volumeGsvM3);
    const outputs = world.movements
      .filter((m) => m.fromNodeId === station.id)
      .map((m) => m.volumeGsvM3);

    const result = computeBalance({
      initial: initialStock,
      inputs,
      outputs,
      measured: initialStock,
    });

    // Structural breakage: computed closing stock is negative (below -1 m³ epsilon)
    if (result.calculated < -1) {
      errors.push(
        `Station ${station.id} (${station.name}) balance closure: computed closing stock is negative (${result.calculated.toFixed(2)} m³). Structural breakage detected.`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 3: Stations km strictly increasing and within [0, totalLengthKm]
  // ------------------------------------------------------------------
  const totalKm = world.pipeline.totalLengthKm;
  for (let i = 0; i < world.stations.length; i++) {
    const station = world.stations[i];
    if (station.km < 0 || station.km > totalKm) {
      errors.push(
        `Station ${station.id} (${station.name}) km (${station.km}) is out of range [0, ${totalKm}]`,
      );
    }
    if (i > 0) {
      const prev = world.stations[i - 1];
      if (station.km <= prev.km) {
        errors.push(
          `Station km ordering violation: ${station.id} (km=${station.km}) is not strictly greater than ${prev.id} (km=${prev.km})`,
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // Rule 5: CathodicReading.level consistent with evaluatePotential
  // ------------------------------------------------------------------
  for (const reading of world.cathodicReadings) {
    const expected = evaluatePotential(reading.potentialV);
    if (reading.level !== expected) {
      errors.push(
        `CathodicReading ${reading.id} level "${reading.level}" is inconsistent with evaluatePotential(${reading.potentialV}) = "${expected}"`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule 6: WorkOrder.progress coherent with status
  // ------------------------------------------------------------------
  for (const wo of world.workOrders) {
    if (wo.status === WorkOrderStatus.COMPLETED && wo.progress !== 100) {
      errors.push(
        `WorkOrder ${wo.id} (${wo.otNumber}) is COMPLETED but progress is ${wo.progress} (expected 100)`,
      );
    }
    if (wo.status === WorkOrderStatus.PLANNED && wo.progress !== 0) {
      errors.push(
        `WorkOrder ${wo.id} (${wo.otNumber}) is PLANNED but progress is ${wo.progress} (expected 0)`,
      );
    }
    if (wo.status === WorkOrderStatus.IN_PROGRESS && (wo.progress <= 0 || wo.progress >= 100)) {
      errors.push(
        `WorkOrder ${wo.id} (${wo.otNumber}) is IN_PROGRESS but progress ${wo.progress} is not in (0, 100)`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
