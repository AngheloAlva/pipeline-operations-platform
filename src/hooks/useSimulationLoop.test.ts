/**
 * Unit tests for createSimulationLoopController.
 * Tests: advances time, respects pause, cleanup stops the loop.
 * rAF is mocked — no real browser APIs required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSimulationLoopController } from "./useSimulationLoop";

// ---------------------------------------------------------------------------
// Minimal rAF mock — synchronous for deterministic testing
// ---------------------------------------------------------------------------

type FrameCallback = (timestamp: number) => void;

function createRafMock() {
  const queue: Array<{ id: number; cb: FrameCallback }> = [];
  let nextId = 1;
  let cancelled = new Set<number>();

  const scheduler = vi.fn((cb: FrameCallback) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  });

  const canceller = vi.fn((id: number) => {
    cancelled.add(id);
  });

  /** Drain one pending frame at the given timestamp. */
  function flush(timestamp: number) {
    const entry = queue.shift();
    if (!entry) return;
    if (!cancelled.has(entry.id)) {
      entry.cb(timestamp);
    }
  }

  /** Drain all pending frames. */
  function flushAll(timestamps: number[]) {
    for (const ts of timestamps) flush(ts);
  }

  function pendingCount() {
    return queue.filter((e) => !cancelled.has(e.id)).length;
  }

  return { scheduler, canceller, flush, flushAll, pendingCount };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSimulationLoopController", () => {
  let raf: ReturnType<typeof createRafMock>;

  beforeEach(() => {
    raf = createRafMock();
  });

  it("calls onTick with the delta between consecutive frames", () => {
    const controller = createSimulationLoopController();
    const onTick = vi.fn();
    const isHidden = () => false;

    controller.start(raf.scheduler, raf.canceller, isHidden, onTick);

    // First frame: lastTimestamp = null → no tick yet
    raf.flush(1000);
    expect(onTick).not.toHaveBeenCalled();

    // Second frame: delta = 1016 - 1000 = 16ms
    raf.flush(1016);
    expect(onTick).toHaveBeenCalledWith(16);
  });

  it("does not call onTick when isHidden returns true (resets lastTimestamp)", () => {
    const controller = createSimulationLoopController();
    const onTick = vi.fn();
    let hidden = false;
    const isHidden = () => hidden;

    controller.start(raf.scheduler, raf.canceller, isHidden, onTick);

    // Establish lastTimestamp
    raf.flush(1000);
    expect(onTick).not.toHaveBeenCalled();

    // Hide the tab — lastTimestamp should be reset
    hidden = true;
    raf.flush(2000);
    expect(onTick).not.toHaveBeenCalled();

    // Un-hide — first frame after unhide should NOT tick (lastTimestamp was null)
    hidden = false;
    raf.flush(2016);
    expect(onTick).not.toHaveBeenCalled();

    // Now it can tick again with a fresh delta
    raf.flush(2032);
    expect(onTick).toHaveBeenCalledWith(16);
  });

  it("cleanup function cancels the rAF loop", () => {
    const controller = createSimulationLoopController();
    const onTick = vi.fn();
    const isHidden = () => false;

    const cancel = controller.start(raf.scheduler, raf.canceller, isHidden, onTick);

    // First frame runs to schedule the next one
    raf.flush(1000);

    // Cancel the loop
    cancel();

    expect(raf.canceller).toHaveBeenCalled();

    // Drain remaining queued frames — onTick should not be called after cancel
    // (the queued frame is cancelled)
    const callsBefore = onTick.mock.calls.length;
    raf.flush(1016);
    expect(onTick.mock.calls.length).toBe(callsBefore);
  });

  it("reschedules rAF on every frame (continuous loop)", () => {
    const controller = createSimulationLoopController();
    const onTick = vi.fn();
    const isHidden = () => false;

    controller.start(raf.scheduler, raf.canceller, isHidden, onTick);

    // Each flush should result in a new rAF call being queued
    const callsBefore = raf.scheduler.mock.calls.length;
    raf.flush(1000); // frame 1 → queues frame 2
    raf.flush(1016); // frame 2 → queues frame 3
    raf.flush(1032); // frame 3 → queues frame 4

    expect(raf.scheduler.mock.calls.length).toBe(callsBefore + 3);
    expect(onTick).toHaveBeenCalledTimes(2); // frames 2 and 3 produce deltas
  });
});
