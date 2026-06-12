/**
 * Pure simulation engine.
 * SR-001 — No side effects, no store imports, no React dependencies.
 */

import type { PipelineWorld } from "@/lib/domain";
import type { SimulationState, ActiveFlow, TickResult, TankAlarmEvent } from "./types";
import { MAX_TICK_MS, TANK_HIGH_LEVEL_ALARM } from "./types";

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Clamp a number within [min, max]. */
function clampLevel(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ============================================================================
// tickSimulation
// ============================================================================

/**
 * Pure tick function: advances the simulation by an effective time step.
 *
 * @param state        Current simulation state.
 * @param deltaMs      Wall-clock elapsed time in ms. Capped internally at MAX_TICK_MS.
 * @param speedMultiplier  Simulation speed (1|10|60|600).
 * @param tankCapacities   Map of tankId → capacityM3 (required for clamping).
 * @returns Partial SimulationState updates + alarm events.
 */
export function tickSimulation(
  state: SimulationState,
  deltaMs: number,
  speedMultiplier: number,
  tankCapacities: Record<string, { capacityM3: number }>,
): TickResult {
  // Cap effective wall-clock delta to avoid tunneling at high speed after tab wake.
  const effectiveDeltaMs = Math.min(deltaMs, MAX_TICK_MS);
  const simDeltaMs = effectiveDeltaMs * speedMultiplier;
  const simDeltaH = simDeltaMs / 3_600_000;

  // Copy current levels so we can mutate a working copy
  const newLevels: Record<string, number> = { ...state.tankLevels };

  for (const flow of state.activeFlows) {
    const deltaV = flow.flowRateM3h * simDeltaH;

    // Destination tank receives volume (inflow)
    if (flow.toNodeId in newLevels) {
      const cap = tankCapacities[flow.toNodeId]?.capacityM3 ?? Infinity;
      newLevels[flow.toNodeId] = clampLevel(newLevels[flow.toNodeId] + deltaV, 0, cap);
    }

    // Source tank loses volume (outflow)
    if (flow.fromNodeId in newLevels) {
      const cap = tankCapacities[flow.fromNodeId]?.capacityM3 ?? Infinity;
      newLevels[flow.fromNodeId] = clampLevel(newLevels[flow.fromNodeId] - deltaV, 0, cap);
    }
  }

  // Produce alarm events for tanks at or above TANK_HIGH_LEVEL_ALARM
  const events: TankAlarmEvent[] = [];
  for (const [tankId, level] of Object.entries(newLevels)) {
    const cap = tankCapacities[tankId]?.capacityM3;
    if (cap !== undefined && level / cap >= TANK_HIGH_LEVEL_ALARM) {
      events.push({
        type: "TANK_HIGH_LEVEL_ALARM",
        tankId,
        level,
        capacity: cap,
      });
    }
  }

  return {
    tankLevels: newLevels,
    simulatedTime: state.simulatedTime + simDeltaMs,
    events,
  };
}

// ============================================================================
// deriveFlowSchedule
// ============================================================================

/**
 * Synthesize a deterministic daily flow schedule from seed movement patterns.
 * The schedule is feasible: it never activates flows that would drain an
 * empty tank or overfill a full one.
 *
 * SR-001 requirements 5 and 6.
 *
 * @param world           The pipeline world with historical movements.
 * @param simulatedTime   Current simulated time as epoch ms.
 * @param currentLevels   Optional current tank levels (used for feasibility).
 *                        Falls back to `world.tanks` initial levels.
 */
export function deriveFlowSchedule(
  world: PipelineWorld,
  simulatedTime: number,
  currentLevels?: Record<string, number>,
): ActiveFlow[] {
  if (world.movements.length === 0) return [];

  // Build capacity map from world tanks
  const capacities: Record<string, number> = {};
  const levels: Record<string, number> = {};
  for (const tank of world.tanks) {
    capacities[tank.id] = tank.capacityM3;
    levels[tank.id] = currentLevels?.[tank.id] ?? tank.currentLevelM3;
  }

  // Determine simulated hour of day (0–23) — drives which flows are active
  const hour = Math.floor((simulatedTime / 3_600_000) % 24);

  // Derive candidate flows from seed movements
  // Each movement type generates a representative flow rate
  const candidates: ActiveFlow[] = [];
  for (const movement of world.movements) {
    const from = movement.fromNodeId;
    const to = movement.toNodeId;

    // Estimate hourly rate from total volume and duration
    let rateM3h: number;
    if (movement.endedAt && movement.startedAt) {
      const durationH =
        (new Date(movement.endedAt).getTime() - new Date(movement.startedAt).getTime()) / 3_600_000;
      rateM3h = durationH > 0 ? movement.volumeGsvM3 / durationH : 0;
    } else {
      rateM3h = 500; // default when duration unknown
    }

    // Domain constraint: flow rates within 300–1500 m³/h (SR-001 req 8)
    rateM3h = clampLevel(rateM3h, 300, 1500);

    // Deterministic active-hour check — idSum % 24 is intentionally simple.
    // It is not a real scheduling algorithm: it produces burst-and-idle patterns
    // where many movements share the same active hour and others have none.
    // The value is deterministic given a fixed movement ID, which is the only
    // requirement here (reproducibility across ticks for the same world).
    const idSum = movement.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const activeHour = idSum % 24;

    if (activeHour !== hour) continue;

    candidates.push({
      fromNodeId: from,
      toNodeId: to,
      flowRateM3h: rateM3h,
      shipperId: movement.shipperId,
    });
  }

  // Feasibility filter: account for projected volume over 1 simulated hour
  // AND concurrent flows. This prevents the schedule from collectively
  // over-filling a destination or over-draining a source.
  //
  // Pass 1: exclude flows that are already infeasible at current state.
  // Pass 2: among remaining candidates, accumulate projected deltas per tank
  //         and drop flows that would exceed headroom or exhaust availability
  //         when combined with previously accepted flows.
  const feasible: ActiveFlow[] = [];

  // Accumulate how much volume is projected to arrive at / leave each tank
  const projectedIn: Record<string, number> = {};
  const projectedOut: Record<string, number> = {};

  for (const flow of candidates) {
    const fromLevel = levels[flow.fromNodeId];
    const toLevel = levels[flow.toNodeId];
    const toCap = capacities[flow.toNodeId];

    // Skip if source tank is already at 0
    if (fromLevel !== undefined && fromLevel <= 0) continue;

    // Skip if destination tank is already at capacity
    if (toLevel !== undefined && toCap !== undefined && toLevel >= toCap) continue;

    // Projected delta for this flow over 1 simulated hour
    const deltaM3 = flow.flowRateM3h;

    // Check combined projected outflow against source availability
    if (fromLevel !== undefined) {
      const alreadyOut = projectedOut[flow.fromNodeId] ?? 0;
      if (alreadyOut + deltaM3 > fromLevel) continue;
    }

    // Check combined projected inflow against destination headroom
    if (toLevel !== undefined && toCap !== undefined) {
      const alreadyIn = projectedIn[flow.toNodeId] ?? 0;
      const headroom = toCap - toLevel;
      if (alreadyIn + deltaM3 > headroom) continue;
    }

    // Flow is feasible — record its projected contribution
    projectedOut[flow.fromNodeId] = (projectedOut[flow.fromNodeId] ?? 0) + deltaM3;
    projectedIn[flow.toNodeId] = (projectedIn[flow.toNodeId] ?? 0) + deltaM3;
    feasible.push(flow);
  }

  return feasible;
}

// ============================================================================
// estimateFillEmptyTime
// ============================================================================

/** Input for time-to-fill / time-to-empty estimates. */
export interface TankEstimateInput {
  id: string;
  level: number;
  capacity: number;
}

/** Output of estimateFillEmptyTime. */
export interface FillEmptyTimeResult {
  /** Hours until the tank is full at the given incoming rate. Infinity if rate = 0. */
  hoursToFull: number;
  /** Hours until the tank is empty at the given outgoing rate. Infinity if rate = 0. */
  hoursToEmpty: number;
  /** Epoch ms when this estimate was produced. */
  estimatedAt: number;
}

/**
 * Estimate time to fill and time to empty a tank.
 * SR-001 req 7.
 *
 * hoursToFull  = (capacity − level) / incomingRate
 * hoursToEmpty = level / outgoingRate
 *
 * @param now - Current epoch ms. Callers must supply this value (e.g. Date.now()
 *              at the call site) to keep this function pure and testable.
 */
export function estimateFillEmptyTime(
  tank: TankEstimateInput,
  incomingRateM3h: number,
  outgoingRateM3h: number,
  now: number,
): FillEmptyTimeResult {
  const hoursToFull =
    incomingRateM3h > 0 ? (tank.capacity - tank.level) / incomingRateM3h : Infinity;

  const hoursToEmpty = outgoingRateM3h > 0 ? tank.level / outgoingRateM3h : Infinity;

  return {
    hoursToFull,
    hoursToEmpty,
    estimatedAt: now,
  };
}
