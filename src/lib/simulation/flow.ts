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

    // Use resolved tank IDs (fromTankId/toTankId) when available;
    // fall back to fromNodeId/toNodeId for backward compatibility.
    const destKey = flow.toTankId ?? flow.toNodeId;
    const srcKey = flow.fromTankId ?? flow.fromNodeId;

    // Destination tank receives volume (inflow)
    if (destKey in newLevels) {
      const cap = tankCapacities[destKey]?.capacityM3 ?? Infinity;
      newLevels[destKey] = clampLevel(newLevels[destKey] + deltaV, 0, cap);
    }

    // Source tank loses volume (outflow)
    if (srcKey in newLevels) {
      const cap = tankCapacities[srcKey]?.capacityM3 ?? Infinity;
      newLevels[srcKey] = clampLevel(newLevels[srcKey] - deltaV, 0, cap);
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
// deriveFlowSchedule — internal helpers
// ============================================================================

/**
 * Returns true if `queryHour` falls within the daily-repeating window
 * [startHour, endHour). Handles wrap-around (e.g. 22→03 spans midnight).
 * A 1-hour window (startHour === endHour) matches only startHour.
 *
 * NOTE: This function only handles sub-24h windows expressed as hour-of-day pairs.
 * Movements whose epoch duration is ≥ 24h are always active (all-day) and bypass
 * this check entirely in deriveFlowSchedule — see the durationH guard there.
 */
function isHourInWindow(startHour: number, endHour: number, queryHour: number): boolean {
  if (startHour === endHour) return queryHour === startHour;
  if (endHour > startHour) return queryHour >= startHour && queryHour < endHour;
  // Wrap-around: e.g. start=22, end=03 → active at 22,23,0,1,2
  return queryHour >= startHour || queryHour < endHour;
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
 * Bug A fix: uses real time-of-day replay — a movement is active when the
 * current simulated UTC hour falls within [startedAt.hour, endedAt.hour)
 * treated as a daily-repeating window. Movements with null endedAt use a
 * 1-hour window starting at startedAt.hour.
 *
 * Bug B fix: resolves each movement's station IDs to concrete tank IDs.
 *   - fromTankId = tank at the source station with the HIGHEST current level
 *   - toTankId   = tank at the destination station with the LOWEST current level
 * The station IDs are preserved in fromNodeId/toNodeId for FlowDiagram routing.
 *
 * @param world           The pipeline world with historical movements.
 * @param simulatedTime   Current simulated time as epoch ms.
 * @param currentLevels   Optional current tank levels (used for feasibility and tank selection).
 *                        Falls back to `world.tanks` initial levels.
 */
export function deriveFlowSchedule(
  world: PipelineWorld,
  simulatedTime: number,
  currentLevels?: Record<string, number>,
): ActiveFlow[] {
  if (world.movements.length === 0) return [];

  // Build capacity map and current levels from world tanks
  const capacities: Record<string, number> = {};
  const levels: Record<string, number> = {};
  for (const tank of world.tanks) {
    capacities[tank.id] = tank.capacityM3;
    levels[tank.id] = currentLevels?.[tank.id] ?? tank.currentLevelM3;
  }

  // Build station → sorted tank IDs map (for tank resolution per station)
  const stationTanks = new Map<string, string[]>();
  for (const tank of world.tanks) {
    const list = stationTanks.get(tank.stationId) ?? [];
    list.push(tank.id);
    stationTanks.set(tank.stationId, list);
  }

  // Determine simulated hour of day (0–23) — drives which flows are active
  const simulatedDate = new Date(simulatedTime);
  const hour = simulatedDate.getUTCHours();

  // Derive candidate flows from seed movements using real time-of-day windows.
  const candidates: ActiveFlow[] = [];
  for (const movement of world.movements) {
    const startEpoch = new Date(movement.startedAt).getTime();
    const startHour = new Date(movement.startedAt).getUTCHours();

    if (movement.endedAt) {
      const endEpoch = new Date(movement.endedAt).getTime();
      const durationH = (endEpoch - startEpoch) / 3_600_000;
      // Movements spanning ≥ 24h are active at every hour of the day.
      // Same-UTC-hour start/end on different days (e.g. 08:00→08:00 next day)
      // would produce startHour === endHour and would wrongly match only that
      // single hour if passed to isHourInWindow — use epoch duration to detect
      // the full-day case and skip the window check entirely.
      if (durationH < 24) {
        const endHour = new Date(movement.endedAt).getUTCHours();
        if (!isHourInWindow(startHour, endHour, hour)) continue;
      }
      // durationH >= 24 → fall through (always active)
    } else {
      // null endedAt → synthetic 1-hour window starting at startHour
      const endHour = (startHour + 1) % 24;
      if (!isHourInWindow(startHour, endHour, hour)) continue;
    }

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

    // Resolve source tank: highest-level tank at the source station (Bug B fix)
    const sourceTanks = stationTanks.get(movement.fromNodeId) ?? [];
    let fromTankId: string | undefined;
    let bestFromLevel = -Infinity;
    for (const tid of sourceTanks) {
      const lvl = levels[tid] ?? 0;
      if (lvl > bestFromLevel) {
        bestFromLevel = lvl;
        fromTankId = tid;
      }
    }

    // Resolve destination tank: lowest-level tank at the destination station (Bug B fix)
    const destTanks = stationTanks.get(movement.toNodeId) ?? [];
    let toTankId: string | undefined;
    let bestToLevel = Infinity;
    for (const tid of destTanks) {
      const lvl = levels[tid] ?? 0;
      if (lvl < bestToLevel) {
        bestToLevel = lvl;
        toTankId = tid;
      }
    }

    candidates.push({
      fromNodeId: movement.fromNodeId, // station ID — for FlowDiagram routing
      toNodeId: movement.toNodeId,     // station ID — for FlowDiagram routing
      fromTankId,
      toTankId,
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
    // Flows with undefined fromTankId (no source tank resolved for the station) intentionally
    // skip projected-volume accounting — no tank means no conservation constraint to enforce.
    // Use resolved tank IDs for feasibility checks (fromTankId/toTankId)
    const fromLevel = flow.fromTankId !== undefined ? levels[flow.fromTankId] : undefined;
    const toLevel = flow.toTankId !== undefined ? levels[flow.toTankId] : undefined;
    const toCap = flow.toTankId !== undefined ? capacities[flow.toTankId] : undefined;

    // Skip if source tank is already at 0
    if (fromLevel !== undefined && fromLevel <= 0) continue;

    // Skip if destination tank is already at capacity
    if (toLevel !== undefined && toCap !== undefined && toLevel >= toCap) continue;

    // Projected delta for this flow over 1 simulated hour
    const deltaM3 = flow.flowRateM3h;

    // Check combined projected outflow against source availability
    if (flow.fromTankId !== undefined && fromLevel !== undefined) {
      const alreadyOut = projectedOut[flow.fromTankId] ?? 0;
      if (alreadyOut + deltaM3 > fromLevel) continue;
    }

    // Check combined projected inflow against destination headroom
    if (flow.toTankId !== undefined && toLevel !== undefined && toCap !== undefined) {
      const alreadyIn = projectedIn[flow.toTankId] ?? 0;
      const headroom = toCap - toLevel;
      if (alreadyIn + deltaM3 > headroom) continue;
    }

    // Flow is feasible — record its projected contribution
    if (flow.fromTankId !== undefined) {
      projectedOut[flow.fromTankId] = (projectedOut[flow.fromTankId] ?? 0) + deltaM3;
    }
    if (flow.toTankId !== undefined) {
      projectedIn[flow.toTankId] = (projectedIn[flow.toTankId] ?? 0) + deltaM3;
    }
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
