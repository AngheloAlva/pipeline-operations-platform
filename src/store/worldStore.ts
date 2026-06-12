import { create } from "zustand";
import seedData from "@/lib/data/seed.json";
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
// Store — initialized with bundled seed so the world is available on first
// render (both SSR and client) without any async step.
// ---------------------------------------------------------------------------

export const useWorldStore = create<WorldStore>((set) => ({
  world: seedData as unknown as PipelineWorld,
  loaded: true,

  loadWorld: (world) => set({ world, loaded: true }),
  hydrate: (world) => set({ world, loaded: true }),
}));

// ---------------------------------------------------------------------------
// Typed selectors
// ---------------------------------------------------------------------------

/** Returns the current world. Always populated from the bundled seed. */
export function useWorld(): PipelineWorld | null {
  return useWorldStore((state) => state.world);
}

/** Returns true once the world is loaded (always true after module init). */
export function useWorldLoaded(): boolean {
  return useWorldStore((state) => state.loaded);
}
