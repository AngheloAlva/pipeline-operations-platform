import { create } from "zustand";

// ---------------------------------------------------------------------------
// STUB — Phase 0 placeholder
// No clock, flow computation, or speed logic is implemented here.
// This stub exists to prevent import errors when Phase 1 wires the real store.
// ---------------------------------------------------------------------------

interface SimulationState {
  isRunning: boolean;
}

interface SimulationActions {
  // Reserved for Phase 1 implementation
}

type SimulationStore = SimulationState & SimulationActions;

export const useSimulationStore = create<SimulationStore>(() => ({
  isRunning: false,
}));
