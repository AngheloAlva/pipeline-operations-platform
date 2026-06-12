"use client";

import { useWorldStore, useWorldLoaded } from "@/store/worldStore";
import type { PipelineWorld } from "@/lib/domain";

/**
 * Returns the current world and a loaded flag for consuming components.
 * The world is always populated from the bundled seed — no async loading needed.
 */
export function useWorldData(): { world: PipelineWorld | null; isLoading: boolean } {
  const world = useWorldStore((state) => state.world);
  const loaded = useWorldLoaded();

  return { world, isLoading: !loaded };
}
