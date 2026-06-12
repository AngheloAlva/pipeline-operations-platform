"use client";

import { useEffect } from "react";
import { useWorldStore, useWorldLoaded } from "@/store/worldStore";
import type { PipelineWorld } from "@/lib/domain";

/**
 * Loads seed.json into the world store on first mount.
 * The import is synchronous (bundled JSON) — no async fetch needed.
 * Returns { world, isLoading } for consuming components.
 */
export function useWorldData(): { world: PipelineWorld | null; isLoading: boolean } {
  const world = useWorldStore((state) => state.world);
  const loaded = useWorldLoaded();
  const loadWorld = useWorldStore((state) => state.loadWorld);

  useEffect(() => {
    if (loaded) return;
    // Dynamic import defers the large JSON from the initial bundle;
    // it still resolves synchronously (no network request — bundled).
    import("@/lib/data/seed.json").then((mod) => {
      loadWorld(mod.default as unknown as PipelineWorld);
    });
  }, [loaded, loadWorld]);

  return { world, isLoading: !loaded };
}
