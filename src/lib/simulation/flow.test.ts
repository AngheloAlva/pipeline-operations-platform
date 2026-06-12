import { describe, it, expect } from "vitest";
import { tickSimulation, deriveFlowSchedule, estimateFillEmptyTime } from "./flow";
import type { SimulationState, ActiveFlow } from "./types";
import type { PipelineWorld } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  overrides: Partial<SimulationState> & { tankLevels: Record<string, number> },
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
  flowRateM3h: number,
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 18_000_000 }],
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 18_000_000 }],
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
      activeFlows: [{ fromNodeId: "T-1", toNodeId: "dst", flowRateM3h: 1000 }],
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 1000 }],
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 1000 }],
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", flowRateM3h: 1000 }],
    });
    // Provide deltaMs = 5000ms, but effective cap = 200ms
    const uncapped = tickSimulation(state, 5000, 1, {
      "T-1": { capacityM3: 100_000 },
    });
    const capped = tickSimulation(state, 200, 1, {
      "T-1": { capacityM3: 100_000 },
    });
    expect(uncapped.tankLevels["T-1"]).toBeCloseTo(capped.tankLevels["T-1"], 5);
  });
});

// ---------------------------------------------------------------------------
// deriveFlowSchedule — Scenario 5 (invariant) and 7 (determinism)
// ---------------------------------------------------------------------------

describe("deriveFlowSchedule", () => {
  // Scenario 7 — Determinism
  it("returns an identical schedule for the same world and simulatedTime", () => {
    const tanks = [makeTank("T-A", 5000, 10_000), makeTank("T-B", 5000, 10_000)];
    const world = makeWorld(tanks, "T-A", "T-B", 500);
    const t = Date.now();
    const s1 = deriveFlowSchedule(world, t);
    const s2 = deriveFlowSchedule(world, t);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  // Scenario 5 — no-overfill / no-overdrain invariant at 600×
  it("produces a schedule that does not overfill or overdrain any tank over 24 simulated hours at 600×", () => {
    const tanks = [makeTank("T-A", 5000, 10_000), makeTank("T-B", 5000, 10_000)];
    const world = makeWorld(tanks, "T-A", "T-B", 500);

    // Simulate 24h at 600× in small wall-clock steps (10ms each = 6s sim)
    // 24h sim = 86400s sim / 600 = 144 real seconds = 14400 wall-clock 10ms steps
    const stepMs = 10; // wall clock
    const simDuration = 24 * 3600 * 1000; // 24h in ms
    const speed = 600;

    let tankLevels: Record<string, number> = { "T-A": 5000, "T-B": 5000 };
    let simulatedTime = Date.now();
    let elapsed = 0;
    const capacities: Record<string, { capacityM3: number }> = {
      "T-A": { capacityM3: 10_000 },
      "T-B": { capacityM3: 10_000 },
    };

    while (elapsed < simDuration) {
      const activeFlows = deriveFlowSchedule(world, simulatedTime);
      const state = makeState({ tankLevels, activeFlows, speedMultiplier: speed, simulatedTime });
      const result = tickSimulation(state, stepMs, speed, capacities);
      tankLevels = result.tankLevels;
      simulatedTime = result.simulatedTime;
      elapsed += stepMs * speed;

      for (const [id, level] of Object.entries(tankLevels)) {
        const cap = capacities[id]?.capacityM3;
        expect(level).toBeGreaterThanOrEqual(0);
        if (cap !== undefined) expect(level).toBeLessThanOrEqual(cap);
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
    const drainsEmptyTank = schedule.some((f) => f.fromNodeId === "T-A" && f.flowRateM3h > 0);
    expect(drainsEmptyTank).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Projected-volume feasibility tests (concurrent flows, near-full/near-empty)
  // -------------------------------------------------------------------------

  /** Build a world with multiple movements that all share the same activeHour.
   * We force the hash to land on a specific hour by crafting movement IDs whose
   * charCode sum % 24 equals the desired hour. */
  function makeWorldWithMovements(
    tanks: ReturnType<typeof makeTank>[],
    moves: Array<{ from: string; to: string; rateM3h: number; id: string }>,
    targetHour: number,
  ): PipelineWorld {
    return {
      pipeline: {
        id: "p1",
        name: "Test pipeline",
        diameterInches: 16,
        totalLengthKm: 100,
        segments: [],
      },
      stations: [{ id: "s1", name: "Station 1", kind: "PUMP_STATION", km: 0, pipelineId: "p1" }],
      tanks,
      shippers: [{ id: "sh1", name: "Shipper 1" }],
      equipment: [],
      movements: moves.map((m) => {
        // Pad the id so charCodeSum % 24 == targetHour
        const base = m.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const remainder = (targetHour - (base % 24) + 24) % 24;
        // Append remainder null chars (charCode 0) or spaces (32) to shift sum
        // Use a deterministic padding: append remainder ASCII chars that each contribute 1
        // Use char \x01 (charCode 1) repeated `remainder` times
        const paddedId = m.id + "\x01".repeat(remainder);
        return {
          id: paddedId,
          type: "PIPELINE" as const,
          fromNodeId: m.from,
          toNodeId: m.to,
          shipperId: "sh1",
          volumeGsvM3: m.rateM3h * 1,
          volume15CM3: m.rateM3h * 1,
          volume60FM3: m.rateM3h * 1,
          temperatureF: 77,
          apiGravity: 30,
          startedAt: "2026-06-01T00:00:00Z",
          endedAt: "2026-06-01T01:00:00Z",
        };
      }),
      volumeTargets: [],
      maintenancePlans: [],
      workOrders: [],
      cathodicReadings: [],
      telemetry: [],
    };
  }

  it("excludes/trims concurrent inflows that would collectively overfill a near-full tank (≥99%)", () => {
    // T-DEST is at 99% of capacity (9900/10000). Two inflows each at 500 m³/h.
    // Over 1 simulated hour, combined delta = 1000 m³, but headroom = 100 m³.
    // The feasibility check must ensure combined projected delta ≤ headroom.
    const destCap = 10_000;
    const destLevel = 9_900; // 99% full
    const tanks = [
      makeTank("T-SRC1", 5000, 10_000),
      makeTank("T-SRC2", 5000, 10_000),
      makeTank("T-DEST", destLevel, destCap),
    ];

    // Force both movements to the same hour by using a fixed simulatedTime
    // corresponding to hour 0 (epoch start is hour 0 UTC)
    const targetHour = 0;
    const simulatedTime = 0; // epoch ms → hour 0

    const world = makeWorldWithMovements(
      tanks,
      [
        { from: "T-SRC1", to: "T-DEST", rateM3h: 500, id: "flow1" },
        { from: "T-SRC2", to: "T-DEST", rateM3h: 500, id: "flow2" },
      ],
      targetHour,
    );

    const schedule = deriveFlowSchedule(world, simulatedTime, {
      "T-SRC1": 5000,
      "T-SRC2": 5000,
      "T-DEST": destLevel,
    });

    // Combined projected fill over 1h = sum of rates × 1h
    const inflows = schedule.filter((f) => f.toNodeId === "T-DEST");
    const combinedDeltaM3 = inflows.reduce((sum, f) => sum + f.flowRateM3h * 1, 0);
    const headroom = destCap - destLevel;

    // The schedule must not project more volume than headroom
    expect(combinedDeltaM3).toBeLessThanOrEqual(headroom);
  });

  it("excludes/trims concurrent outflows from a near-empty source tank", () => {
    // T-SRC is at 1% of capacity (100/10000). Two outflows each at 100 m³/h.
    // Over 1h, combined drain = 200 m³, but availability = 100 m³.
    const srcCap = 10_000;
    const srcLevel = 100; // ~1% full
    const tanks = [
      makeTank("T-SRC", srcLevel, srcCap),
      makeTank("T-DEST1", 5000, 10_000),
      makeTank("T-DEST2", 5000, 10_000),
    ];

    const targetHour = 0;
    const simulatedTime = 0;

    const world = makeWorldWithMovements(
      tanks,
      [
        { from: "T-SRC", to: "T-DEST1", rateM3h: 100, id: "out1" },
        { from: "T-SRC", to: "T-DEST2", rateM3h: 100, id: "out2" },
      ],
      targetHour,
    );

    const schedule = deriveFlowSchedule(world, simulatedTime, {
      "T-SRC": srcLevel,
      "T-DEST1": 5000,
      "T-DEST2": 5000,
    });

    const outflows = schedule.filter((f) => f.fromNodeId === "T-SRC");
    const combinedDrainM3 = outflows.reduce((sum, f) => sum + f.flowRateM3h * 1, 0);
    const available = srcLevel;

    expect(combinedDrainM3).toBeLessThanOrEqual(available);
  });

  // Strengthened long-run invariant: 24h at 600× near-boundary tanks
  // Asserts (a) levels in [0, cap] and (b) clamp never engaged
  it("24h at 600× with tanks near boundaries: levels stay in [0,cap] and clamping never engages", () => {
    // Start T-A near-full and T-B near-empty to maximize boundary pressure
    const tanks = [makeTank("T-A", 9_500, 10_000), makeTank("T-B", 500, 10_000)];
    const world = makeWorld(tanks, "T-A", "T-B", 500);

    const stepMs = 10;
    const simDuration = 24 * 3600 * 1000;
    const speed = 600;

    let tankLevels: Record<string, number> = { "T-A": 9_500, "T-B": 500 };
    let simulatedTime = Date.now();
    let elapsed = 0;
    const capacities: Record<string, { capacityM3: number }> = {
      "T-A": { capacityM3: 10_000 },
      "T-B": { capacityM3: 10_000 },
    };

    let prevLevels = { ...tankLevels };
    let clampEngaged = false;

    while (elapsed < simDuration) {
      const activeFlows = deriveFlowSchedule(world, simulatedTime, tankLevels);
      const state = makeState({ tankLevels, activeFlows, speedMultiplier: speed, simulatedTime });
      const result = tickSimulation(state, stepMs, speed, capacities);

      // Detect if clamping engaged: a level pinned at exactly 0 or cap while a flow is active
      if (activeFlows.length > 0) {
        for (const [id, level] of Object.entries(result.tankLevels)) {
          const cap = capacities[id]?.capacityM3;
          const prevLevel = prevLevels[id] ?? level;
          if (cap !== undefined) {
            // Clamping engaged if level sits at boundary AND it was already at boundary last tick
            if (level === 0 && prevLevel === 0) clampEngaged = true;
            if (level === cap && prevLevel === cap) clampEngaged = true;
          }
        }
      }

      prevLevels = { ...result.tankLevels };
      tankLevels = result.tankLevels;
      simulatedTime = result.simulatedTime;
      elapsed += stepMs * speed;

      for (const [id, level] of Object.entries(tankLevels)) {
        const cap = capacities[id]?.capacityM3;
        expect(level).toBeGreaterThanOrEqual(0);
        if (cap !== undefined) expect(level).toBeLessThanOrEqual(cap);
      }
    }

    expect(clampEngaged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// estimateFillEmptyTime
// ---------------------------------------------------------------------------

describe("estimateFillEmptyTime", () => {
  const FIXED_NOW = 1_700_000_000_000; // deterministic epoch for testing

  it("computes hoursToFull = (capacity - level) / incomingRate", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      1000,
      0,
      FIXED_NOW,
    );
    expect(result.hoursToFull).toBeCloseTo(5, 5);
  });

  it("computes hoursToEmpty = level / outgoingRate", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      0,
      500,
      FIXED_NOW,
    );
    expect(result.hoursToEmpty).toBeCloseTo(10, 5);
  });

  it("returns Infinity for hoursToFull when incomingRate is 0", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      0,
      500,
      FIXED_NOW,
    );
    expect(result.hoursToFull).toBe(Infinity);
  });

  it("returns Infinity for hoursToEmpty when outgoingRate is 0", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      500,
      0,
      FIXED_NOW,
    );
    expect(result.hoursToEmpty).toBe(Infinity);
  });

  it("uses the provided now parameter as estimatedAt (pure — no Date.now() call)", () => {
    const result = estimateFillEmptyTime(
      { id: "T-1", level: 5000, capacity: 10_000 },
      1000,
      1000,
      FIXED_NOW,
    );
    expect(result.estimatedAt).toBe(FIXED_NOW);
  });
});
