/**
 * useSimulationLoop — rAF-driven simulation tick hook.
 * SR-004: side-effect-only hook; reads store via getState(), writes via tick().
 * No reactive subscription inside the loop (prevents 60fps re-render storm).
 */

"use client";

import { useEffect, useRef } from "react";
import { useSimulationStore } from "@/store/simulationStore";
import { MAX_TICK_MS } from "@/lib/simulation/types";

// ---------------------------------------------------------------------------
// createSimulationLoopController
// ---------------------------------------------------------------------------
// Pure (non-React) controller factory — extracted for testability.
// The hook wires this to the real rAF/document APIs.

export interface LoopController {
  /** Start the rAF loop. Returns a cancel handle. */
  start: (
    rafScheduler: (cb: FrameRequestCallback) => number,
    rafCanceller: (id: number) => void,
    isHidden: () => boolean,
    onTick: (deltaMs: number) => void,
  ) => () => void;
}

/** Create a rAF loop controller. Exposed for unit testing. */
export function createSimulationLoopController(): LoopController {
  return {
    start(rafScheduler, rafCanceller, isHidden, onTick) {
      let rafId = 0;
      let lastTimestamp: number | null = null;

      function frame(timestamp: number) {
        if (!isHidden()) {
          if (lastTimestamp !== null) {
            const raw = timestamp - lastTimestamp;
            const deltaMs = Math.min(raw, MAX_TICK_MS);
            onTick(deltaMs);
          }
          lastTimestamp = timestamp;
        } else {
          // Tab is hidden — discard accumulated time to avoid burst on wake
          lastTimestamp = null;
        }

        rafId = rafScheduler(frame);
      }

      rafId = rafScheduler(frame);

      return () => {
        rafCanceller(rafId);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// useSimulationLoop
// ---------------------------------------------------------------------------

/**
 * Mounts a requestAnimationFrame loop that drives the simulation.
 *
 * - Reads `isRunning` from the store via `getState()` (no reactive sub).
 * - On each frame, if running, calls `store.tick(deltaMs)`.
 * - Pauses when `document.hidden` to avoid time jumps after tab wake.
 * - Cancels the rAF on unmount.
 * - Returns nothing (side-effect-only hook).
 *
 * SR-004.
 */
export function useSimulationLoop(): void {
  const controllerRef = useRef<ReturnType<typeof createSimulationLoopController> | null>(null);

  useEffect(() => {
    const controller = createSimulationLoopController();
    controllerRef.current = controller;

    const cancel = controller.start(
      // rAF scheduler
      (cb) => requestAnimationFrame(cb),
      // rAF canceller
      (id) => cancelAnimationFrame(id),
      // isHidden check
      () => document.hidden,
      // onTick — reads store via getState(), calls tick()
      (deltaMs) => {
        const { isRunning, tick } = useSimulationStore.getState();
        if (isRunning) {
          tick(deltaMs);
        }
      },
    );

    return cancel;
  }, []);
}
