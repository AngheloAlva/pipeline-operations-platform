/**
 * Simulation store — full Phase 1 implementation.
 * SR-003: tankLevels, activeFlows, simulatedTime, speedMultiplier, isRunning.
 * Driven externally by useSimulationLoop (rAF hook) — no internal intervals.
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { PipelineWorld } from "@/lib/domain";
import { SIM_SPEEDS } from "@/lib/domain";
import { tickSimulation, deriveFlowSchedule } from "@/lib/simulation/flow";
import type { ActiveFlow, SimulationState } from "@/lib/simulation/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimulationSlice extends SimulationState {
  // Internal snapshot for deterministic reset
  _seedLevels: Record<string, number>;
  _seedTime: number;
  // Tank capacity map for tick
  _tankCapacities: Record<string, { capacityM3: number }>;
  // World reference for deriveFlowSchedule
  _world: PipelineWorld | null;
}

interface SimulationActions {
  init: (world: PipelineWorld) => void;
  start: () => void;
  pause: () => void;
  setSpeed: (multiplier: (typeof SIM_SPEEDS)[number]) => void;
  reset: () => void;
  tick: (deltaMs: number) => void;
}

type SimulationStore = SimulationSlice & SimulationActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const INITIAL_SLICE: SimulationSlice = {
  isRunning: false,
  speedMultiplier: 1,
  simulatedTime: 0,
  tankLevels: {},
  activeFlows: [],
  _seedLevels: {},
  _seedTime: 0,
  _tankCapacities: {},
  _world: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  ...INITIAL_SLICE,

  // -------------------------------------------------------------------
  // init — capture seed snapshot and compute initial activeFlows
  // -------------------------------------------------------------------
  init: (world) => {
    const tankLevels: Record<string, number> = {};
    const tankCapacities: Record<string, { capacityM3: number }> = {};

    for (const tank of world.tanks) {
      tankLevels[tank.id] = tank.currentLevelM3;
      tankCapacities[tank.id] = { capacityM3: tank.capacityM3 };
    }

    // simulatedTime = endedAt of the latest completed movement.
    // Fallback: current Date.now() if no ended movements exist.
    const endedTimes = world.movements
      .filter((m) => m.endedAt)
      .map((m) => new Date(m.endedAt!).getTime());

    const simulatedTime = endedTimes.length > 0 ? Math.max(...endedTimes) : Date.now();

    const activeFlows = deriveFlowSchedule(world, simulatedTime, tankLevels);

    set({
      tankLevels,
      _seedLevels: { ...tankLevels },
      _seedTime: simulatedTime,
      simulatedTime,
      activeFlows,
      _tankCapacities: tankCapacities,
      _world: world,
      isRunning: false,
      speedMultiplier: 1,
    });
  },

  // -------------------------------------------------------------------
  // start / pause
  // -------------------------------------------------------------------
  start: () => set({ isRunning: true }),

  pause: () => set({ isRunning: false }),

  // -------------------------------------------------------------------
  // setSpeed — guarded to SIM_SPEEDS
  // -------------------------------------------------------------------
  setSpeed: (multiplier) => {
    if (!(SIM_SPEEDS as readonly number[]).includes(multiplier)) return;
    set({ speedMultiplier: multiplier });
  },

  // -------------------------------------------------------------------
  // reset — restore seed snapshot
  // -------------------------------------------------------------------
  reset: () => {
    const { _seedLevels, _seedTime, _world } = get();
    const tankLevels = { ..._seedLevels };
    const activeFlows = _world ? deriveFlowSchedule(_world, _seedTime, tankLevels) : [];

    set({
      isRunning: false,
      simulatedTime: _seedTime,
      tankLevels,
      activeFlows,
    });
  },

  // -------------------------------------------------------------------
  // tick — advance simulation by deltaMs wall-clock time
  // Called by useSimulationLoop; only advances when isRunning.
  // -------------------------------------------------------------------
  tick: (deltaMs) => {
    const state = get();
    if (!state.isRunning) return;

    const result = tickSimulation(state, deltaMs, state.speedMultiplier, state._tankCapacities);

    // Refresh active flows at the new simulated time
    const activeFlows = state._world
      ? deriveFlowSchedule(state._world, result.simulatedTime, result.tankLevels)
      : state.activeFlows;

    // Avoid rebuilding tankLevels when nothing changed (no active flows).
    // Subscribers that select individual tanks re-render only when their value
    // changes; but a new map object on every tick causes whole-map subscribers
    // to re-render even when all levels are identical.
    const tankLevels = state.activeFlows.length === 0 ? state.tankLevels : result.tankLevels;

    set({
      tankLevels,
      simulatedTime: result.simulatedTime,
      activeFlows,
    });
  },
}));

// ---------------------------------------------------------------------------
// Per-tank selector factory — SR-003 req 9, SR-014
// Returns a selector function (state) => number for fine-grained subscription.
// ---------------------------------------------------------------------------

/**
 * Create a stable selector for a single tank's level.
 * Used in FlowDiagram / TankGauge to avoid coarse subscriptions.
 *
 * @example
 *   const level = useSimulationStore(selectTankLevel("T-101"));
 */
export function selectTankLevel(tankId: string): (state: SimulationStore) => number {
  return (state) => state.tankLevels[tankId] ?? 0;
}

// ---------------------------------------------------------------------------
// Typed convenience hooks (add more as needed by UI components)
// ---------------------------------------------------------------------------

/** Fine-grained selector for activeFlows (uses shallow equality). */
export function useActiveFlows(): ActiveFlow[] {
  return useSimulationStore(useShallow((state) => state.activeFlows));
}

/** Fine-grained selector for simulation running status. */
export function useIsRunning(): boolean {
  return useSimulationStore((state) => state.isRunning);
}

/** Fine-grained selector for speed multiplier. */
export function useSpeedMultiplier(): (typeof SIM_SPEEDS)[number] {
  return useSimulationStore((state) => state.speedMultiplier);
}

/** Fine-grained selector for the current simulated time (epoch ms). */
export function useSimulatedTime(): number {
  return useSimulationStore((state) => state.simulatedTime);
}
