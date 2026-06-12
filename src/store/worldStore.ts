"use client";

import { create } from "zustand";
import type { PipelineWorld } from "@/lib/domain";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface WorldState {
  world: PipelineWorld | null;
  loaded: boolean;
}

interface WorldActions {
  loadWorld: (world: PipelineWorld) => void;
  hydrate: (world: PipelineWorld) => void;
}

type WorldStore = WorldState & WorldActions;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorldStore = create<WorldStore>((set) => ({
  world: null,
  loaded: false,

  loadWorld: (world) => set({ world, loaded: true }),
  hydrate: (world) => set({ world, loaded: true }),
}));

// ---------------------------------------------------------------------------
// Typed selectors
// ---------------------------------------------------------------------------

/** Returns the current world, or null if not yet loaded. */
export function useWorld(): PipelineWorld | null {
  return useWorldStore((state) => state.world);
}

/** Returns true once loadWorld has been called at least once. */
export function useWorldLoaded(): boolean {
  return useWorldStore((state) => state.loaded);
}
