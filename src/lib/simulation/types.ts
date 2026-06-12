/**
 * Simulation types and constants.
 * SR-001, SR-003, SR-004.
 * No side effects — pure type declarations and domain constants.
 */

import { SIM_SPEEDS, TANK_HIGH_LEVEL_ALARM } from "@/lib/domain";

export type { };

// Re-export domain constants so simulation modules have a single import point.
export { SIM_SPEEDS, TANK_HIGH_LEVEL_ALARM };

// ============================================================================
// SIMULATION CONSTANTS
// ============================================================================

/**
 * Maximum effective delta in ms per tick.
 * Prevents tunneling at 600× when the browser was backgrounded.
 * SR-001 req 9, Design ADR.
 */
export const MAX_TICK_MS = 200;

// ============================================================================
// INTERFACES
// ============================================================================

/** A flow currently active in the simulation (one direction, one shipper). */
export interface ActiveFlow {
  /** Source node (tank id, station id, or external node id). */
  fromNodeId: string;
  /** Destination node. */
  toNodeId: string;
  /** Volumetric flow rate in m³/h. */
  flowRateM3h: number;
  /** Optional associated shipper. */
  shipperId?: string;
}

/** A scheduled flow entry — part of the synthesized daily cycle. */
export interface FlowScheduleEntry extends ActiveFlow {
  /** Simulated hour of day (0–23) at which this flow is active. */
  hourOfDay: number;
}

/** Snapshot of the simulation state (what tickSimulation reads and writes). */
export interface SimulationState {
  /** Whether the simulation clock is running. */
  isRunning: boolean;
  /** Current speed multiplier. Must be one of SIM_SPEEDS. */
  speedMultiplier: (typeof SIM_SPEEDS)[number];
  /** Current simulated time as Unix epoch ms. */
  simulatedTime: number;
  /** Current level per tank id in m³. */
  tankLevels: Record<string, number>;
  /** Flows active at the current simulated time. */
  activeFlows: ActiveFlow[];
}

/** Actions exposed by the simulation store. */
export interface SimulationActions {
  /** Initialize store from a PipelineWorld snapshot (captures seed levels). */
  init: (world: import("@/lib/domain").PipelineWorld) => void;
  /** Start the simulation clock. */
  start: () => void;
  /** Pause the simulation clock. */
  pause: () => void;
  /**
   * Set speed multiplier. Ignored if the value is not in SIM_SPEEDS.
   * SR-003 req 2.
   */
  setSpeed: (multiplier: (typeof SIM_SPEEDS)[number]) => void;
  /** Restore state to the initial seed snapshot. */
  reset: () => void;
  /**
   * Advance the simulation by deltaMs wall-clock milliseconds.
   * Called by useSimulationLoop — not for direct use in components.
   */
  tick: (deltaMs: number) => void;
}

// ============================================================================
// HIGH-LEVEL ALARM EVENT
// ============================================================================

/** Event produced by tickSimulation when a tank exceeds TANK_HIGH_LEVEL_ALARM. */
export interface TankAlarmEvent {
  type: "TANK_HIGH_LEVEL_ALARM";
  tankId: string;
  level: number;
  capacity: number;
}

/** Full result of a tickSimulation call. */
export interface TickResult {
  /** New tank levels (only updated tanks guaranteed to be present). */
  tankLevels: Record<string, number>;
  /** Updated simulated time in epoch ms. */
  simulatedTime: number;
  /** Any alarm events produced during this tick. */
  events: TankAlarmEvent[];
}
