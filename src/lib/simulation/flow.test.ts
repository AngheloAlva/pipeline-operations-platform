import { describe, it, expect } from "vitest";
import {
  tickSimulation,
  deriveFlowSchedule,
  estimateFillEmptyTime,
} from "./flow";
import type { SimulationState, ActiveFlow } from "./types";
import type { PipelineWorld } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  overrides: Partial<SimulationState> & { tankLevels: Record<string, number> }
): SimulationState {
  return {
    isRunning: true,
    speedMultiplier: 1,
    simulatedTime: 0,
    activeFlows: [],
    ...overrides,
  };
}

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

/** Build a minimal PipelineWorld for deriveFlowSchedule tests. */
function makeWorld(
  tanks: ReturnType<typeof makeTank>[],
  fromNodeId: string,
  toNodeId: string,
  flowRateM3h: number
): PipelineWorld {
  return {
    pipeline: {
      id: "p1",
      name: "Test pipeline",
      diameterInches: 16,
      totalLengthKm: 100,
      segments: [],
    },
    stations: [
      { id: "s1", name: "Station 1", kind: "PUMP_STATION", km: 0, pipelineId: "p1" },
      { id: "s2", name: "Station 2", kind: "TERMINAL", km: 100, pipelineId: "p1" },
    ],
    tanks,
    shippers: [{ id: "sh1", name: "Shipper 1" }],
    equipment: [],
    movements: [
      {
        id: "m1",
        type: "PIPELINE",
        fromNodeId,
        toNodeId,
        shipperId: "sh1",
        volumeGsvM3: flowRateM3h * 24,
        volume15CM3: flowRateM3h * 24,
        volume60FM3: flowRateM3h * 24,
        temperatureF: 77,
        apiGravity: 30,
        startedAt: "2026-06-01T00:00:00Z",
        endedAt: "2026-06-02T00:00:00Z",
      },
    ],
    volumeTargets: [],
    maintenancePlans: [],
    workOrders: [],
    cathodicReadings: [],
    telemetry: [],
  };
}

// ---------------------------------------------------------------------------
// tickSimulation — Scenarios 1–4, 6
// ---------------------------------------------------------------------------

describe("tickSimulation", () => {
  // Scenario 1 — Single fill tick: use 600× speed with 200ms cap to get 1 simulated hour
  // 200ms wall × 600 = 120000ms sim = 120s sim = 1/30 h sim × 1000m³/h = 33.333 m³
  // But to get exactly +1000 m³ we need 1 sim-hour: use 1× speed but inject at a rate
  // that fills 1000m³ in 200ms at 1×. Rate = 1000 / (200/3600000) = 18_000_000 m³/h.
  // Simpler: just verify the formula directly.
  it("advances level by Δv = flowRate × min(deltaMs,MAX_TICK_MS) × speed / 3_600_000", () => {
    const state = makeState({
      tankLevels: { "T-1": 5000 },
      activeFlows: [
        { fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 18_000_000 },
      ],
    });
    // 200ms × 1× = 200ms sim → 200/3600000 h × 18_000_000 m³/h = 1000 m³
    const result = tickSimulation(state, 200, 1, {
      "T-1": { capacityM3: 100_000 },
    });
    expect(result.tankLevels["T-1"]).toBeCloseTo(6000, 5);
  });

  // Scenario 2 — Clamp at capacity: ensure overfill is prevented
  it("clamps level at capacityM3 (no overfill)", () => {
    const state = makeState({
      tankLevels: { "T-1": 9900 },
      activeFlows: [
        { fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 18_000_000 },
      ],
    });
    // Δv >> remaining space → must clamp at 10000
    const result = tickSimulation(state, 200, 1, {
      "T-1": { capacityM3: 10_000 },
    });
    expect(result.tankLevels["T-1"]).toBe(10_000);
  });

  // Scenario 3 — Clamp at zero (no overdrain)
  it("clamps level at 0 (no overdrain)", () => {
    // At 600× speed with deltaMs=200ms: Δv = 1000 × (200×600/3600000) = 33.33 m³
    // Starting level 10 will go to -23.33 → must be clamped to 0
    const state = makeState({
      tankLevels: { "T-1": 10 },
      activeFlows: [
        { fromNodeId: "T-1", toNodeId: "dst", flowRateM3h: 1000 },
      ],
      speedMultiplier: 600,
    });
    const result = tickSimulation(state, 200, 600, {
      "T-1": { capacityM3: 10_000 },
    });
    expect(result.tankLevels["T-1"]).toBe(0);
  });

  // Scenario 4 — Speed multiplier
  it("applies speedMultiplier to the simulated Δv (within MAX_TICK_MS cap)", () => {
    const state = makeState({
      tankLevels: { "T-1": 5000 },
      activeFlows: [
        { fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 1000 },
      ],
    });
    // deltaMs=200ms (at cap) × 60 = 12s sim = 12/3600 h × 1000 m³/h = 3.333 m³
    const expected = 5000 + 1000 * ((200 * 60) / 3_600_000);
    const result = tickSimulation(state, 200, 60, {
      "T-1": { capacityM3: 10_000 },
    });
    expect(result.tankLevels["T-1"]).toBeCloseTo(expected, 5);
  });

  // Scenario 6 — High-level alarm event
  it("emits TANK_HIGH_LEVEL_ALARM event when level is at or above 95% capacity", () => {
    // Start at exactly 95% (9500/10000) — should trigger alarm immediately
    const state = makeState({
      tankLevels: { "T-1": 9500 },
      activeFlows: [
        { fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 1000 },
      ],
    });
    const result = tickSimulation(state, 200, 1, {
      "T-1": { capacityM3: 10_000 },
    });
    const alarm = result.events.find((e) => e.tankId === "T-1");
    expect(alarm).toBeDefined();
    expect(alarm?.type).toBe("TANK_HIGH_LEVEL_ALARM");
  });

  // Ensure simulatedTime advances (deltaMs is capped at MAX_TICK_MS=200 first)
  it("advances simulatedTime by min(deltaMs,200) × speedMultiplier", () => {
    const state = makeState({ tankLevels: {} });
    // deltaMs=100 is under cap → 100 × 60 = 6000
    const result = tickSimulation(state, 100, 60, {});
    expect(result.simulatedTime).toBe(6_000);
  });

  // MAX_TICK_MS clamp: delta capped at 200ms before multiplying
  it("caps effective deltaMs at MAX_TICK_MS (200) before multiplying by speed", () => {
    const state = makeState({
      tankLevels: { "T-1": 0 },
      activeFlows: [
        { fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 1000 },
      ],
    });
    // Provide deltaMs = 5000ms, but effective cap = 200ms
    const uncapped = tickSimulation(state, 5000, 1, {
      "T-1": { capacityM3: 100_000 },
    });
    const capped = tickSimulation(state, 200, 1, {
      "T-1": { capacityM3: 100_000 },
    });
    expect(uncapped.tankLevels["T-1"]).toBeCloseTo(
      capped.tankLevels["T-1"],
      5
    );
  });
});

// ---------------------------------------------------------------------------
// deriveFlowSchedule — Scenario 5 (invariant) and 7 (determinism)
// ---------------------------------------------------------------------------

describe("deriveFlowSchedule", () => {
  // Scenario 7 — Determinism
  it("returns an identical schedule for the same world and simulatedTime", () => {
    const tanks = [
      makeTank("T-A", 5000, 10_000),
      makeTank("T-B", 5000, 10_000),
    ];
    const world = makeWorld(tanks, "T-A", "T-B", 500);
    const t = Date.now();
    const s1 = deriveFlowSchedule(world, t);
    const s2 = deriveFlowSchedule(world, t);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  // Scenario 5 — no-overfill / no-overdrain invariant at 600×
  it("produces a schedule that does not overfill or overdrain any tank over 24 simulated hours at 600×", () => {
    const tanks = [
      makeTank("T-A", 5000, 10_000),
      makeTank("T-B", 5000, 10_000),
    ];
    const world = makeWorld(tanks, "T-A", "T-B", 500);

    // Simulate 24h at 600× in small wall-clock steps (10ms each = 6s sim)
    // 24h sim = 86400s sim / 600 = 144 real seconds = 14400 wall-clock 10ms steps
    const stepMs = 10; // wall clock
    const simDuration = 24 * 3600 * 1000; // 24h in ms
    const speed = 600;

    let tankLevels: Record<string, number> = { "T-A": 5000, "T-B": 5000 };
    let simulatedTime = Date.now();
    let elapsed = 0;
    const capacities: Record<string, number> = { "T-A": 10_000, "T-B": 10_000 };

    while (elapsed < simDuration) {
      const activeFlows = deriveFlowSchedule(world, simulatedTime);
      const state = makeState({ tankLevels, activeFlows, speedMultiplier: speed, simulatedTime });
      const result = tickSimulation(state, stepMs, speed, capacities);
      tankLevels = result.tankLevels;
      simulatedTime = result.simulatedTime;
      elapsed += stepMs * speed;

      for (const [id, level] of Object.entries(tankLevels)) {
        const cap = capacities[id];
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(cap);
      }
    }
  });

  // Assert schedule is feasible: check the schedule itself does not demand
  // more outflow than available level over a realistic step
  it("produces only feasible flows: no flow from a tank with level 0", () => {
    const tanks = [
      makeTank("T-A", 0, 10_000), // empty — should not be drained further
      makeTank("T-B", 5000, 10_000),
    ];
    const world = makeWorld(tanks, "T-A", "T-B", 500);
    const schedule = deriveFlowSchedule(world, Date.now(), {
      "T-A": 0,
      "T-B": 5000,
    });
    // Any flow draining T-A should be filtered out (level = 0)
    const drainsEmptyTank = schedule.some(
      (f) => f.fromNodeId === "T-A" && f.flowRateM3h > 0
    );
    expect(drainsEmptyTank).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// estimateFillEmptyTime
// ---------------------------------------------------------------------------

describe("estimateFillEmptyTime", () => {
  it("computes hoursToFull = (capacity - level) / incomingRate", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      1000,
      0
    );
    expect(result.hoursToFull).toBeCloseTo(5, 5);
  });

  it("computes hoursToEmpty = level / outgoingRate", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      0,
      500
    );
    expect(result.hoursToEmpty).toBeCloseTo(10, 5);
  });

  it("returns Infinity for hoursToFull when incomingRate is 0", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      0,
      500
    );
    expect(result.hoursToFull).toBe(Infinity);
  });

  it("returns Infinity for hoursToEmpty when outgoingRate is 0", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      500,
      0
    );
    expect(result.hoursToEmpty).toBe(Infinity);
  });

  it("includes estimatedAt as a number (epoch ms)", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      1000,
      1000
    );
    expect(typeof result.estimatedAt).toBe("number");
    expect(result.estimatedAt).toBeGreaterThan(0);
  });
});
