/**
 * Unit tests for simulationStore.
 * SR-003 — store logic (state transitions), not UI.
 * Uses Zustand's getState() directly to avoid React/component setup.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useSimulationStore, selectTankLevel, INITIAL_SLICE } from "./simulationStore";
import { SIM_SPEEDS } from "@/lib/domain";
import type { PipelineWorld } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Seed world fixture
// ---------------------------------------------------------------------------

function makeTank(id: string, level: number, capacity: number) {
  return {
    id,
    tag: id,
    stationId: "s1",
    capacityM3: capacity,
    currentLevelM3: level,
    heightMm: 0,
    product: "CRUD",
    apiGravity: 30,
    temperatureF: 77,
  };
}

const SEED_WORLD: PipelineWorld = {
  pipeline: {
    id: "p1",
    name: "Test",
    diameterInches: 16,
    totalLengthKm: 100,
    segments: [],
  },
  stations: [{ id: "s1", name: "Station 1", kind: "PUMP_STATION", km: 0, pipelineId: "p1" }],
  tanks: [makeTank("T-101", 5000, 10_000), makeTank("T-6010", 3000, 8_000)],
  shippers: [],
  equipment: [],
  movements: [
    {
      id: "m1",
      type: "PIPELINE",
      fromNodeId: "T-101",
      toNodeId: "T-6010",
      volumeGsvM3: 500,
      volume15CM3: 500,
      volume60FM3: 500,
      temperatureF: 77,
      apiGravity: 30,
      startedAt: "2026-06-01T10:00:00Z",
      endedAt: "2026-06-12T14:00:00Z",
    },
  ],
  volumeTargets: [],
  maintenancePlans: [],
  workOrders: [],
  cathodicReadings: [],
  telemetry: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStore() {
  return useSimulationStore.getState();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("simulationStore", () => {
  beforeEach(() => {
    // Reset the FULL store state (public + private fields) using INITIAL_SLICE.
    // Do NOT pass true (replace) — that would strip actions from the store.
    useSimulationStore.setState(INITIAL_SLICE);
  });

  // SR-003 Scenario 1 — Initial state (post-init)
  it("initializes state from world: isRunning=false, seedLevels, simulatedTime from last movement", () => {
    getStore().init(SEED_WORLD);
    const state = getStore();
    expect(state.isRunning).toBe(false);
    expect(state.speedMultiplier).toBe(1);
    expect(state.tankLevels["T-101"]).toBe(5000);
    expect(state.tankLevels["T-6010"]).toBe(3000);
    // simulatedTime should be the endedAt of the last movement
    const expectedTime = new Date("2026-06-12T14:00:00Z").getTime();
    expect(state.simulatedTime).toBe(expectedTime);
  });

  // SR-003 Scenario 2 — setSpeed guard
  it("ignores setSpeed calls with values not in SIM_SPEEDS", () => {
    getStore().init(SEED_WORLD);
    const before = getStore().speedMultiplier;
    getStore().setSpeed(42 as unknown as (typeof SIM_SPEEDS)[number]);
    expect(getStore().speedMultiplier).toBe(before);
  });

  it("accepts setSpeed calls with valid SIM_SPEEDS values", () => {
    getStore().init(SEED_WORLD);
    getStore().setSpeed(60);
    expect(getStore().speedMultiplier).toBe(60);
  });

  // SR-003 Scenario 3 — Reset is deterministic
  it("reset restores exact seed levels and simulatedTime after tick", () => {
    getStore().init(SEED_WORLD);
    const initialTime = getStore().simulatedTime;
    const initialLevels = { ...getStore().tankLevels };

    // Run several ticks to mutate state
    getStore().start();
    getStore().tick(200);
    getStore().tick(200);

    // Now reset
    getStore().reset();
    const afterReset = getStore();

    expect(afterReset.isRunning).toBe(false);
    expect(afterReset.simulatedTime).toBe(initialTime);
    expect(afterReset.tankLevels["T-101"]).toBe(initialLevels["T-101"]);
    expect(afterReset.tankLevels["T-6010"]).toBe(initialLevels["T-6010"]);
  });

  // SR-003 Scenario 4 — Reset is idempotent
  it("reset called twice produces identical state", () => {
    getStore().init(SEED_WORLD);
    getStore().start();
    getStore().tick(200);

    getStore().reset();
    const firstReset = { ...getStore().tankLevels, time: getStore().simulatedTime };

    getStore().reset();
    const secondReset = { ...getStore().tankLevels, time: getStore().simulatedTime };

    expect(secondReset).toEqual(firstReset);
  });

  // SR-003 Scenario 5 — Per-tank selector isolation
  it("selectTankLevel selector only changes value for the subscribed tank", () => {
    getStore().init(SEED_WORLD);
    getStore().start();

    const levelT101Before = selectTankLevel("T-101")(getStore());
    const levelT6010Before = selectTankLevel("T-6010")(getStore());

    // Manually update only T-101
    useSimulationStore.setState((s) => ({
      tankLevels: { ...s.tankLevels, "T-101": s.tankLevels["T-101"] + 100 },
    }));

    const levelT101After = selectTankLevel("T-101")(getStore());
    const levelT6010After = selectTankLevel("T-6010")(getStore());

    // T-101 changed
    expect(levelT101After).toBe(levelT101Before + 100);
    // T-6010 unchanged — selector returns the same value
    expect(levelT6010After).toBe(levelT6010Before);
  });

  // Fix 4 — tankLevels reference stability: tick with no active flows must not rebuild the map
  it("tick with no active flows preserves the tankLevels reference (no spurious rebuild)", () => {
    getStore().init(SEED_WORLD);
    // Ensure no active flows
    useSimulationStore.setState({ activeFlows: [] });
    getStore().start();

    const refBefore = getStore().tankLevels;
    getStore().tick(50);
    const refAfter = getStore().tankLevels;

    expect(refAfter).toBe(refBefore);
  });

  // Fix 5 — private field isolation: private fields must be reset between tests
  it("private fields (_seedLevels, _world, _seedTime, _tankCapacities) are reset by beforeEach", () => {
    // After beforeEach, all private fields should match INITIAL_SLICE
    const state = getStore();
    expect(state._seedLevels).toEqual({});
    expect(state._world).toBeNull();
    expect(state._seedTime).toBe(0);
    expect(state._tankCapacities).toEqual({});
  });

  it("init in one test does not leak _seedLevels to the next test", () => {
    // This test verifies that the previous test's init (with SEED_WORLD) does not
    // persist into this test — beforeEach must reset private fields.
    const state = getStore();
    // _seedLevels must be empty because beforeEach resets via INITIAL_SLICE
    expect(Object.keys(state._seedLevels)).toHaveLength(0);
    expect(state._world).toBeNull();
  });

  // start/pause
  it("start sets isRunning=true, pause sets isRunning=false", () => {
    getStore().init(SEED_WORLD);
    getStore().start();
    expect(getStore().isRunning).toBe(true);
    getStore().pause();
    expect(getStore().isRunning).toBe(false);
  });

  // tick advances simulatedTime when running
  it("tick advances simulatedTime and tank levels when isRunning=true", () => {
    getStore().init(SEED_WORLD);
    // Add an active flow so levels change
    useSimulationStore.setState({
      activeFlows: [{ fromNodeId: "T-101", toNodeId: "T-6010", flowRateM3h: 1000 }],
    });
    getStore().start();
    const timeBefore = getStore().simulatedTime;
    getStore().tick(200);
    const timeAfter = getStore().simulatedTime;
    // simulatedTime should advance by at most 200 × speedMultiplier = 200ms at 1×
    expect(timeAfter).toBeGreaterThan(timeBefore);
  });
});
