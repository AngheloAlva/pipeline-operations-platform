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
  /**
   * Apply operator-captured absolute levels (m³) to the live simulation.
   * MV-9 integration hook for captureStore: a committed capture must be
   * visible to the live gauges immediately, without a full re-init.
   * Values are clamped to [0, capacity]. Seed levels are untouched, so
   * reset() still restores the original seed.
   */
  applyCapturedLevels: (levels: Record<string, number>) => void;
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
  //
  // MV-14 guard: captureStore republishes the world through
  // worldStore.loadWorld() on every commit/roster declaration, which
  // re-fires the cockpit's `init(world)` effect. Worlds DERIVED from the
  // same seed preserve the `pipeline` object reference through spreads —
  // that lineage marker distinguishes "same session, new derived world"
  // (soft sync: keep live state) from "genuinely new seed" (full init).
  // -------------------------------------------------------------------
  init: (world) => {
    const prev = get();

    if (prev._world !== null && prev._world.pipeline === world.pipeline) {
      // Soft sync — adopt the new world for schedule derivation without
      // wiping captured levels, transport (isRunning/speed), sim clock,
      // or the original seed snapshot (reset() still restores the seed).
      const nextLevels = { ...prev.tankLevels };
      const tankCapacities: Record<string, { capacityM3: number }> = {};
      for (const tank of world.tanks) {
        tankCapacities[tank.id] = { capacityM3: tank.capacityM3 };
        if (!(tank.id in nextLevels)) nextLevels[tank.id] = tank.currentLevelM3;
      }
      const activeFlows = deriveFlowSchedule(world, prev.simulatedTime, nextLevels);

      set({
        tankLevels: nextLevels,
        activeFlows,
        _tankCapacities: tankCapacities,
        _world: world,
      });
      return;
    }

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
  // applyCapturedLevels — MV-9 capture integration (see SimulationActions)
  // -------------------------------------------------------------------
  applyCapturedLevels: (levels) => {
    const { tankLevels, _tankCapacities } = get();
    const next = { ...tankLevels };
    for (const [tankId, level] of Object.entries(levels)) {
      const capacity = _tankCapacities[tankId]?.capacityM3;
      const floored = Math.max(level, 0);
      next[tankId] = capacity !== undefined ? Math.min(floored, capacity) : floored;
    }
    set({ tankLevels: next });
  },

  // -------------------------------------------------------------------
  // tick — advance simulation by deltaMs wall-clock time
  // Called by useSimulationLoop; only advances when isRunning.
  // -------------------------------------------------------------------
  tick: (deltaMs) => {
    const state = get();
    if (!state.isRunning) return;

    const result = tickSimulation(state, deltaMs, state.speedMultiplier, state._tankCapacities);

    // Refresh active flows at the new simulated time — but reuse the existing
    // reference when the schedule is structurally identical. deriveFlowSchedule
    // allocates new objects every call, so without this guard useShallow still
    // bails but FlowDiagram memo re-renders at 60fps.
    let activeFlows = state.activeFlows;
    if (state._world) {
      const nextFlows = deriveFlowSchedule(state._world, result.simulatedTime, result.tankLevels);
      // Structural comparison: same length AND every flow's identity fields match.
      // Includes fromTankId/toTankId since deriveFlowSchedule now resolves these.
      const sameSchedule =
        nextFlows.length === state.activeFlows.length &&
        nextFlows.every((f, i) => {
          const prev = state.activeFlows[i];
          return (
            f.fromNodeId === prev.fromNodeId &&
            f.toNodeId === prev.toNodeId &&
            f.fromTankId === prev.fromTankId &&
            f.toTankId === prev.toTankId &&
            f.flowRateM3h === prev.flowRateM3h &&
            f.shipperId === prev.shipperId
          );
        });
      if (!sameSchedule) activeFlows = nextFlows;
    }

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

/**
 * Fine-grained selector for the current simulated time floored to whole seconds.
 *
 * Floors simulatedTime to the nearest whole second before exposing to
 * subscribers. Because Zustand uses Object.is comparison, sub-second ticks
 * (60fps rAF loop) do not trigger a re-render as long as the integer second
 * is unchanged. This suppresses ~59 out of 60 re-renders for components that
 * only display HH:MM:SS (e.g. SimClock).
 *
 * SimClock must use this hook instead of useSimulatedTime().
 */
export function useSimulatedTimeSeconds(): number {
  return useSimulationStore((state) => Math.floor(state.simulatedTime / 1000));
}
