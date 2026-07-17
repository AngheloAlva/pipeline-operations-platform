import { describe, it, expect } from "vitest";
import { tickSimulation, deriveFlowSchedule, estimateFillEmptyTime } from "./flow";
import type { SimulationState } from "./types";
import type { PipelineWorld } from "@/lib/domain";
import seedJson from "@/lib/data/seed.json";

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

function makeTank(id: string, level: number, capacity: number, stationId = "s1") {
  return {
    id,
    tag: id,
    stationId,
    capacityM3: capacity,
    currentLevelM3: level,
    heightMm: 0,
    product: "CRUD",
    apiGravity: 30,
    temperatureF: 77,
  };
}

/** Build a minimal PipelineWorld for deriveFlowSchedule tests.
 * fromNodeId/toNodeId are station IDs; tanks are associated to those stations. */
function makeWorld(
  tanks: ReturnType<typeof makeTank>[],
  fromStationId: string,
  toStationId: string,
  flowRateM3h: number,
  startedAt = "2026-06-01T00:00:00Z",
  endedAt: string | null = "2026-06-02T00:00:00Z",
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
        fromNodeId: fromStationId,
        toNodeId: toStationId,
        shipperId: "sh1",
        volumeGsvM3: flowRateM3h * 24,
        volume15CM3: flowRateM3h * 24,
        volume60FM3: flowRateM3h * 24,
        temperatureF: 77,
        apiGravity: 30,
        startedAt,
        endedAt: endedAt ?? (null as unknown as string),
      },
    ],
    volumeTargets: [],
    maintenancePlans: [],
    workOrders: [],
    cathodicReadings: [],
    telemetry: [],
    custodyDifferences: [],
    operators: [],
    workstations: [],
    shiftRosters: [],
    shiftLogEntries: [],
    pipelineStoppages: [],
    emissionEntries: [],
    closingComments: [],
  };
}

// ---------------------------------------------------------------------------
// tickSimulation — Scenarios 1–4, 6
// After Fix 5: tickSimulation uses fromTankId/toTankId for level updates.
// ---------------------------------------------------------------------------

describe("tickSimulation", () => {
  // Scenario 1 — Single fill tick
  it("advances level by Δv = flowRate × min(deltaMs,MAX_TICK_MS) × speed / 3_600_000", () => {
    const state = makeState({
      tankLevels: { "T-1": 5000 },
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", fromTankId: "src-tank", toTankId: "T-1", flowRateM3h: 18_000_000 }],
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", fromTankId: "src-tank", toTankId: "T-1", flowRateM3h: 18_000_000 }],
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
      activeFlows: [{ fromNodeId: "T-1", toNodeId: "dst", fromTankId: "T-1", toTankId: "dst-tank", flowRateM3h: 1000 }],
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", fromTankId: "src-tank", toTankId: "T-1", flowRateM3h: 1000 }],
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", fromTankId: "src-tank", toTankId: "T-1", flowRateM3h: 1000 }],
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
      activeFlows: [{ fromNodeId: "src", toNodeId: "T-1", fromTankId: "src-tank", toTankId: "T-1", flowRateM3h: 1000 }],
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

  // Fix 5 Bug B regression: tickSimulation must use fromTankId/toTankId, not fromNodeId/toNodeId.
  // If the flow has station IDs as fromNodeId/toNodeId but proper tank IDs in fromTankId/toTankId,
  // only the tank-keyed levels must change.
  it("updates fromTankId/toTankId levels, not fromNodeId/toNodeId when they differ", () => {
    const state = makeState({
      tankLevels: { "TNK-A": 5000, "TNK-B": 3000 },
      activeFlows: [
        {
          fromNodeId: "STA-001",
          toNodeId: "STA-002",
          fromTankId: "TNK-A",
          toTankId: "TNK-B",
          flowRateM3h: 18_000_000,
        },
      ],
    });
    const result = tickSimulation(state, 200, 1, {
      "TNK-A": { capacityM3: 100_000 },
      "TNK-B": { capacityM3: 100_000 },
    });
    // TNK-A should decrease by 1000 m³
    expect(result.tankLevels["TNK-A"]).toBeCloseTo(4000, 5);
    // TNK-B should increase by 1000 m³
    expect(result.tankLevels["TNK-B"]).toBeCloseTo(4000, 5);
    // Station-keyed levels must NOT appear
    expect(result.tankLevels["STA-001"]).toBeUndefined();
    expect(result.tankLevels["STA-002"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deriveFlowSchedule — Scenario 5 (invariant), 7 (determinism), and Fix 5 tests
// ---------------------------------------------------------------------------

describe("deriveFlowSchedule", () => {
  // Scenario 7 — Determinism
  it("returns an identical schedule for the same world and simulatedTime", () => {
    const tanks = [makeTank("T-A", 5000, 10_000, "s1"), makeTank("T-B", 5000, 10_000, "s2")];
    const world = makeWorld(tanks, "s1", "s2", 500);
    const t = new Date("2026-06-01T08:00:00Z").getTime(); // hour 8 is active
    const s1 = deriveFlowSchedule(world, t);
    const s2 = deriveFlowSchedule(world, t);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  // Fix 5 Bug A: real time-of-day window check
  it("activates a movement when simulated hour falls within [startedAt.hour, endedAt.hour) window", () => {
    // Movement from 08:00 to 12:00 — active at hours 8,9,10,11; inactive at 12
    const tanks = [makeTank("T-A", 5000, 10_000, "s1"), makeTank("T-B", 2000, 10_000, "s2")];
    const world = makeWorld(tanks, "s1", "s2", 500,
      "2026-06-01T08:00:00Z",
      "2026-06-01T12:00:00Z",
    );

    const atHour9 = new Date("2026-06-10T09:30:00Z").getTime();
    const schedule9 = deriveFlowSchedule(world, atHour9);
    expect(schedule9.length).toBeGreaterThan(0);

    const atHour12 = new Date("2026-06-10T12:00:00Z").getTime();
    const schedule12 = deriveFlowSchedule(world, atHour12);
    expect(schedule12.length).toBe(0);

    const atHour7 = new Date("2026-06-10T07:00:00Z").getTime();
    const schedule7 = deriveFlowSchedule(world, atHour7);
    expect(schedule7.length).toBe(0);
  });

  it("handles wrap-around windows (endedAt.hour < startedAt.hour = spans midnight)", () => {
    // Movement from 22:00 to 03:00 — active at hours 22,23,0,1,2; inactive at 3
    const tanks = [makeTank("T-A", 5000, 10_000, "s1"), makeTank("T-B", 2000, 10_000, "s2")];
    const world = makeWorld(tanks, "s1", "s2", 500,
      "2026-06-01T22:00:00Z",
      "2026-06-02T03:00:00Z",
    );

    const atHour23 = new Date("2026-06-10T23:00:00Z").getTime();
    const schedule23 = deriveFlowSchedule(world, atHour23);
    expect(schedule23.length).toBeGreaterThan(0);

    const atHour1 = new Date("2026-06-10T01:00:00Z").getTime();
    const schedule1 = deriveFlowSchedule(world, atHour1);
    expect(schedule1.length).toBeGreaterThan(0);

    const atHour3 = new Date("2026-06-10T03:00:00Z").getTime();
    const schedule3 = deriveFlowSchedule(world, atHour3);
    expect(schedule3.length).toBe(0);
  });

  // Fix: exact 24h span (startedAt and endedAt land on the same UTC hour, different days).
  // The movement 08:00 day-1 → 08:00 day-2 spans exactly 24h and must be active at ALL hours.
  // The old startHour === endHour branch wrongly matched only hour 8.
  it("treats startedAt/endedAt on same UTC hour on different days (24h span) as active all 24h", () => {
    const tanks = [makeTank("T-A", 5000, 10_000, "s1"), makeTank("T-B", 2000, 10_000, "s2")];
    const world = makeWorld(
      tanks,
      "s1",
      "s2",
      500,
      "2026-06-01T08:00:00Z",
      "2026-06-02T08:00:00Z", // exactly 24h later — same UTC hour, different day
    );

    // Active at hour 8 (obvious match)
    const atHour8 = new Date("2026-06-10T08:00:00Z").getTime();
    expect(deriveFlowSchedule(world, atHour8).length).toBeGreaterThan(0);

    // Active at hour 0 (midnight — NOT the start hour, must still be active)
    const atHour0 = new Date("2026-06-10T00:00:00Z").getTime();
    expect(deriveFlowSchedule(world, atHour0).length).toBeGreaterThan(0);

    // Active at hour 15 (middle of day — must still be active)
    const atHour15 = new Date("2026-06-10T15:00:00Z").getTime();
    expect(deriveFlowSchedule(world, atHour15).length).toBeGreaterThan(0);
  });

  // null endedAt → synthetic 1-hour window (unchanged behavior)
  it("treats null endedAt as a 1-hour window from startedAt.hour", () => {
    // Movement with null endedAt starting at hour 10 — should be active only at hour 10
    const tanks = [makeTank("T-A", 5000, 10_000, "s1"), makeTank("T-B", 2000, 10_000, "s2")];
    const world = makeWorld(tanks, "s1", "s2", 500,
      "2026-06-01T10:00:00Z",
      null,
    );

    const atHour10 = new Date("2026-06-10T10:00:00Z").getTime();
    const schedule10 = deriveFlowSchedule(world, atHour10);
    expect(schedule10.length).toBeGreaterThan(0);

    const atHour11 = new Date("2026-06-10T11:00:00Z").getTime();
    const schedule11 = deriveFlowSchedule(world, atHour11);
    expect(schedule11.length).toBe(0);
  });

  // Fix 5 Bug B: deriveFlowSchedule resolves station→tank and sets fromTankId/toTankId
  it("sets fromTankId and toTankId on returned ActiveFlow entries", () => {
    // s1 has T-A (level 5000), s2 has T-B (level 2000)
    // Movement: s1 → s2 at hour 8
    const tanks = [makeTank("T-A", 5000, 10_000, "s1"), makeTank("T-B", 2000, 10_000, "s2")];
    const world = makeWorld(tanks, "s1", "s2", 500,
      "2026-06-01T08:00:00Z",
      "2026-06-01T12:00:00Z",
    );
    const atHour9 = new Date("2026-06-10T09:00:00Z").getTime();
    const schedule = deriveFlowSchedule(world, atHour9);
    expect(schedule.length).toBeGreaterThan(0);
    for (const flow of schedule) {
      // fromTankId and toTankId must be defined
      expect(flow.fromTankId).toBeDefined();
      expect(flow.toTankId).toBeDefined();
      // They must be actual tank IDs (not station IDs)
      expect(flow.fromTankId).not.toBe("s1");
      expect(flow.toTankId).not.toBe("s2");
    }
  });

  it("resolves fromTankId = highest-level tank at source station", () => {
    // s1 has T-LOW (1000) and T-HIGH (8000): fromTankId should be T-HIGH
    const tanks = [
      makeTank("T-LOW", 1000, 10_000, "s1"),
      makeTank("T-HIGH", 8000, 10_000, "s1"),
      makeTank("T-DST", 2000, 10_000, "s2"),
    ];
    const world = makeWorld(tanks, "s1", "s2", 500,
      "2026-06-01T08:00:00Z",
      "2026-06-01T12:00:00Z",
    );
    const atHour9 = new Date("2026-06-10T09:00:00Z").getTime();
    const schedule = deriveFlowSchedule(world, atHour9, { "T-LOW": 1000, "T-HIGH": 8000, "T-DST": 2000 });
    expect(schedule.length).toBeGreaterThan(0);
    const flow = schedule[0];
    expect(flow.fromTankId).toBe("T-HIGH");
  });

  it("resolves toTankId = lowest-level tank at destination station", () => {
    // s2 has T-FULL (9000) and T-EMPTY (500): toTankId should be T-EMPTY
    const tanks = [
      makeTank("T-SRC", 5000, 10_000, "s1"),
      makeTank("T-FULL", 9000, 10_000, "s2"),
      makeTank("T-EMPTY", 500, 10_000, "s2"),
    ];
    const world = makeWorld(tanks, "s1", "s2", 500,
      "2026-06-01T08:00:00Z",
      "2026-06-01T12:00:00Z",
    );
    const atHour9 = new Date("2026-06-10T09:00:00Z").getTime();
    const schedule = deriveFlowSchedule(world, atHour9, { "T-SRC": 5000, "T-FULL": 9000, "T-EMPTY": 500 });
    expect(schedule.length).toBeGreaterThan(0);
    const flow = schedule[0];
    expect(flow.toTankId).toBe("T-EMPTY");
  });

  it("keeps fromNodeId/toNodeId as station IDs for FlowDiagram routing", () => {
    const tanks = [makeTank("T-A", 5000, 10_000, "s1"), makeTank("T-B", 2000, 10_000, "s2")];
    const world = makeWorld(tanks, "s1", "s2", 500,
      "2026-06-01T08:00:00Z",
      "2026-06-01T12:00:00Z",
    );
    const atHour9 = new Date("2026-06-10T09:00:00Z").getTime();
    const schedule = deriveFlowSchedule(world, atHour9);
    for (const flow of schedule) {
      expect(flow.fromNodeId).toBe("s1");
      expect(flow.toNodeId).toBe("s2");
    }
  });

  // Fix 5 Bug A + real seed: at hour 20 (init hour), at least 1 flow should be active
  it("seed.json at simulated hour 20 (init hour) has active flows", () => {
    const world = seedJson as import("@/lib/domain").PipelineWorld;
    const atHour20 = new Date("2026-06-11T20:00:00Z").getTime();

    // Build stationTanks map and current levels from seed
    const stationTanks = new Map<string, readonly string[]>();
    for (const tank of world.tanks) {
      const existing = stationTanks.get(tank.stationId) ?? [];
      stationTanks.set(tank.stationId, [...existing, tank.id]);
    }
    const currentLevels: Record<string, number> = {};
    for (const tank of world.tanks) {
      currentLevels[tank.id] = tank.currentLevelM3;
    }

    const schedule = deriveFlowSchedule(world, atHour20, currentLevels);
    expect(schedule.length).toBeGreaterThan(0);
  });

  // Scenario 5 — no-overfill / no-overdrain invariant at 600×
  it("produces a schedule that does not overfill or overdrain any tank over 24 simulated hours at 600×", () => {
    const tanks = [makeTank("T-A", 5000, 10_000, "s1"), makeTank("T-B", 5000, 10_000, "s2")];
    const world = makeWorld(tanks, "s1", "s2", 500);

    // Simulate 24h at 600× in small wall-clock steps (10ms each = 6s sim)
    // 24h sim = 86400s sim / 600 = 144 real seconds = 14400 wall-clock 10ms steps
    const stepMs = 10; // wall clock
    const simDuration = 24 * 3600 * 1000; // 24h in ms
    const speed = 600;

    let tankLevels: Record<string, number> = { "T-A": 5000, "T-B": 5000 };
    let simulatedTime = new Date("2026-06-01T08:00:00Z").getTime(); // hour 8 = active
    let elapsed = 0;
    const capacities: Record<string, { capacityM3: number }> = {
      "T-A": { capacityM3: 10_000 },
      "T-B": { capacityM3: 10_000 },
    };

    while (elapsed < simDuration) {
      const activeFlows = deriveFlowSchedule(world, simulatedTime, tankLevels);
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
      makeTank("T-A", 0, 10_000, "s1"), // empty — should not be drained further
      makeTank("T-B", 5000, 10_000, "s2"),
    ];
    const world = makeWorld(tanks, "s1", "s2", 500);
    const atHour8 = new Date("2026-06-01T08:00:00Z").getTime();
    const schedule = deriveFlowSchedule(world, atHour8, {
      "T-A": 0,
      "T-B": 5000,
    });
    // Any flow draining T-A should be filtered out (level = 0)
    const drainsEmptyTank = schedule.some((f) => f.fromTankId === "T-A" && f.flowRateM3h > 0);
    expect(drainsEmptyTank).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Projected-volume feasibility tests (concurrent flows, near-full/near-empty)
  // -------------------------------------------------------------------------

  /** Build a world with multiple movements that all share the same active time window. */
  function makeWorldWithMovements(
    tanks: ReturnType<typeof makeTank>[],
    moves: Array<{ from: string; to: string; rateM3h: number; id: string }>,
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
      movements: moves.map((m) => ({
        id: m.id,
        type: "PIPELINE" as const,
        fromNodeId: m.from,
        toNodeId: m.to,
        shipperId: "sh1",
        volumeGsvM3: m.rateM3h * 1,
        volume15CM3: m.rateM3h * 1,
        volume60FM3: m.rateM3h * 1,
        temperatureF: 77,
        apiGravity: 30,
        // Time window: 09:00–12:00, so active at hours 9,10,11
        startedAt: "2026-06-01T09:00:00Z",
        endedAt: "2026-06-01T12:00:00Z",
      })),
      volumeTargets: [],
      maintenancePlans: [],
      workOrders: [],
      cathodicReadings: [],
      telemetry: [],
      custodyDifferences: [],
      operators: [],
      workstations: [],
      shiftRosters: [],
      shiftLogEntries: [],
      pipelineStoppages: [],
      emissionEntries: [],
      closingComments: [],
    };
  }

  it("excludes/trims concurrent inflows that would collectively overfill a near-full tank (≥99%)", () => {
    // T-DEST is at 99% of capacity (9900/10000). Two inflows each at 500 m³/h.
    // Over 1 simulated hour, combined delta = 1000 m³, but headroom = 100 m³.
    // The feasibility check must ensure combined projected delta ≤ headroom.
    const destCap = 10_000;
    const destLevel = 9_900; // 99% full
    const tanks = [
      makeTank("T-SRC1", 5000, 10_000, "src1"),
      makeTank("T-SRC2", 5000, 10_000, "src2"),
      makeTank("T-DEST", destLevel, destCap, "dest"),
    ];

    // Force movements to hour 10 window
    const simulatedTime = new Date("2026-06-10T10:00:00Z").getTime();

    const world = makeWorldWithMovements(
      tanks,
      [
        { from: "src1", to: "dest", rateM3h: 500, id: "flow1" },
        { from: "src2", to: "dest", rateM3h: 500, id: "flow2" },
      ],
    );

    const schedule = deriveFlowSchedule(world, simulatedTime, {
      "T-SRC1": 5000,
      "T-SRC2": 5000,
      "T-DEST": destLevel,
    });

    // Combined projected fill over 1h = sum of rates × 1h
    const inflows = schedule.filter((f) => f.toTankId === "T-DEST");
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
      makeTank("T-SRC", srcLevel, srcCap, "src"),
      makeTank("T-DEST1", 5000, 10_000, "dst1"),
      makeTank("T-DEST2", 5000, 10_000, "dst2"),
    ];

    const simulatedTime = new Date("2026-06-10T10:00:00Z").getTime();

    const world = makeWorldWithMovements(
      tanks,
      [
        { from: "src", to: "dst1", rateM3h: 100, id: "out1" },
        { from: "src", to: "dst2", rateM3h: 100, id: "out2" },
      ],
    );

    const schedule = deriveFlowSchedule(world, simulatedTime, {
      "T-SRC": srcLevel,
      "T-DEST1": 5000,
      "T-DEST2": 5000,
    });

    const outflows = schedule.filter((f) => f.fromTankId === "T-SRC");
    const combinedDrainM3 = outflows.reduce((sum, f) => sum + f.flowRateM3h * 1, 0);
    const available = srcLevel;

    expect(combinedDrainM3).toBeLessThanOrEqual(available);
  });

  // Strengthened long-run invariant: 24h at 600× near-boundary tanks
  // Asserts (a) levels in [0, cap] and (b) clamp never engaged
  it("24h at 600× with tanks near boundaries: levels stay in [0,cap] and clamping never engages", () => {
    // Start T-A near-full and T-B near-empty to maximize boundary pressure
    const tanks = [makeTank("T-A", 9_500, 10_000, "s1"), makeTank("T-B", 500, 10_000, "s2")];
    const world = makeWorld(tanks, "s1", "s2", 500);

    const stepMs = 10;
    const simDuration = 24 * 3600 * 1000;
    const speed = 600;

    let tankLevels: Record<string, number> = { "T-A": 9_500, "T-B": 500 };
    let simulatedTime = new Date("2026-06-01T08:00:00Z").getTime(); // hour 8 = active
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
