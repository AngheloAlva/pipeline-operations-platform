/**
 * Tests for maintenance lib selectors — SR-204 Scenarios 1–14.
 * Strict TDD: tests written BEFORE implementation (RED → GREEN).
 */
import { describe, it, expect } from "vitest";
import {
  computeMaintenanceKpis,
  deriveEquipmentTree,
  deriveMaintenanceBoardRows,
  deriveEquipmentHoursOutlook,
  filterMaintenanceBoardRows,
  bucketTasksByMonth,
  applyWorkOrderTransition,
  applyTaskCompletion,
  taskKey,
} from "./selectors";
import type {
  MaintenanceOverrides,
  MaintenanceBoardFilter,
  MaintenanceBoardRow,
} from "./selectors";
import {
  Criticality,
  EquipmentType,
  MaintenanceFrequency,
  MaintenanceType,
  WorkOrderStatus,
  WorkOrderPriority,
} from "@/lib/domain";
import type {
  PipelineWorld,
  Station,
  Equipment,
  MaintenancePlan,
  MaintenanceTask,
  WorkOrder,
} from "@/lib/domain";
import { TaskStatus } from "./scheduling";

// ============================================================================
// FIXTURES
// ============================================================================

function makeStation(id: string, km: number, name?: string): Station {
  return {
    id,
    name: name ?? `Station ${id}`,
    kind: "PUMP_STATION" as const,
    km,
    pipelineId: "pipe-1",
  };
}

function makeEquipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "EQP-001",
    tag: "J-001",
    name: "Pump A",
    type: EquipmentType.PUMP,
    criticality: Criticality.MEDIUM,
    isOperational: true,
    stationId: "STA-001",
    operatingHours: 1000,
    ...overrides,
  };
}

function makeTask(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    id: "TSK-001",
    planId: "PLN-001",
    name: "Check lubrication",
    type: MaintenanceType.PREVENTIVE,
    frequency: MaintenanceFrequency.MONTHLY,
    nextDueDate: "2026-07-01",
    ...overrides,
  };
}

function makePlan(overrides: Partial<MaintenancePlan> = {}): MaintenancePlan {
  return {
    id: "PLN-001",
    name: "Plan A",
    description: "Test plan",
    isActive: true,
    tasks: [makeTask()],
    ...overrides,
  };
}

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "WO-001",
    otNumber: "OT-TRA-001",
    type: MaintenanceType.CORRECTIVE,
    status: WorkOrderStatus.PLANNED,
    priority: WorkOrderPriority.MEDIUM,
    progress: 0,
    description: "Fix pump",
    equipmentId: "EQP-001",
    stationId: "STA-001",
    programDate: "2026-06-15",
    estimatedHours: 8,
    ...overrides,
  };
}

function emptyOverrides(): MaintenanceOverrides {
  return { workOrderStatuses: {}, completedTasks: {} };
}

function emptyWorld(): PipelineWorld {
  return {
    pipeline: {
      id: "pipe-1",
      name: "Test Pipeline",
      diameterInches: 16,
      totalLengthKm: 100,
      segments: [],
    },
    stations: [],
    tanks: [],
    shippers: [],
    equipment: [],
    movements: [],
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

// ============================================================================
// SR-204 Scenario 1 — vencidas count
// ============================================================================
describe("computeMaintenanceKpis — SR-204 §1–6", () => {
  it("Scenario 1: counts vencidas (OVERDUE) and proximas (UPCOMING) correctly", () => {
    // 3 OVERDUE tasks (nextDueDate in the past), 2 UPCOMING (due within 7 days), 1 OK
    const now = "2026-06-12";
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });

    const overdueTask1 = makeTask({ id: "T1", planId: "P1", nextDueDate: "2026-05-01" });
    const overdueTask2 = makeTask({ id: "T2", planId: "P1", nextDueDate: "2026-04-01" });
    const overdueTask3 = makeTask({ id: "T3", planId: "P1", nextDueDate: "2026-03-01" });
    const upcomingTask1 = makeTask({ id: "T4", planId: "P1", nextDueDate: "2026-06-15" }); // 3 days
    const upcomingTask2 = makeTask({ id: "T5", planId: "P1", nextDueDate: "2026-06-18" }); // 6 days
    const okTask = makeTask({ id: "T6", planId: "P1", nextDueDate: "2026-07-01" });

    const plan = makePlan({
      id: "P1",
      equipmentId: "EQP-001",
      tasks: [overdueTask1, overdueTask2, overdueTask3, upcomingTask1, upcomingTask2, okTask],
    });

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [makeStation("STA-001", 10)],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const kpis = computeMaintenanceKpis(world, now);
    expect(kpis.vencidas).toBe(3);
    expect(kpis.proximas).toBe(2);
  });

  // ============================================================================
  // SR-204 Scenario 2 — otAbiertas count
  // ============================================================================
  it("Scenario 2: counts otAbiertas (PLANNED + IN_PROGRESS + ON_HOLD), excludes COMPLETED", () => {
    const workOrders = [
      makeWorkOrder({ id: "WO-1", status: WorkOrderStatus.IN_PROGRESS }),
      makeWorkOrder({ id: "WO-2", status: WorkOrderStatus.IN_PROGRESS }),
      makeWorkOrder({ id: "WO-3", status: WorkOrderStatus.PLANNED }),
      makeWorkOrder({ id: "WO-4", status: WorkOrderStatus.ON_HOLD }),
      makeWorkOrder({ id: "WO-5", status: WorkOrderStatus.COMPLETED }),
    ];

    const world: PipelineWorld = { ...emptyWorld(), workOrders };
    const kpis = computeMaintenanceKpis(world, "2026-06-12");
    expect(kpis.otAbiertas).toBe(4); // 2 IN_PROGRESS + 1 PLANNED + 1 ON_HOLD
  });

  // ============================================================================
  // SR-204 Scenario 3 — equiposCriticos count
  // ============================================================================
  it("Scenario 3: counts equiposCriticos (Criticality.CRITICAL)", () => {
    const equipment = [
      makeEquipment({ id: "E1", criticality: Criticality.CRITICAL }),
      makeEquipment({ id: "E2", criticality: Criticality.CRITICAL }),
      makeEquipment({ id: "E3", criticality: Criticality.CRITICAL }),
      makeEquipment({ id: "E4", criticality: Criticality.HIGH }),
      makeEquipment({ id: "E5", criticality: Criticality.MEDIUM }),
    ];

    const world: PipelineWorld = { ...emptyWorld(), equipment };
    const kpis = computeMaintenanceKpis(world, "2026-06-12");
    expect(kpis.equiposCriticos).toBe(3);
  });

  // ============================================================================
  // SR-204 Scenario 4 — inactive plans excluded
  // ============================================================================
  it("Scenario 4: excludes tasks from inactive plans", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const overdueTask = makeTask({ id: "T1", planId: "P1", nextDueDate: "2026-01-01" });
    const inactivePlan = makePlan({
      id: "P1",
      isActive: false, // inactive!
      equipmentId: "EQP-001",
      tasks: [overdueTask],
    });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [inactivePlan],
    };

    const kpis = computeMaintenanceKpis(world, "2026-06-12");
    expect(kpis.vencidas).toBe(0); // inactive plan tasks must NOT count
  });
});

// ============================================================================
// SR-204 Scenario 5 — tree structure
// ============================================================================
describe("deriveEquipmentTree — SR-204 §7", () => {
  it("Scenario 5: 3-level tree — stations → types → equipment", () => {
    const sta1 = makeStation("STA-001", 10, "Station Alpha");
    const sta2 = makeStation("STA-002", 20, "Station Beta");

    const equipment = [
      makeEquipment({ id: "EQP-P1", tag: "J-001", name: "Pump 1", type: EquipmentType.PUMP, stationId: "STA-001" }),
      makeEquipment({ id: "EQP-V1", tag: "V-001", name: "Valve 1", type: EquipmentType.VALVE, stationId: "STA-001" }),
      makeEquipment({ id: "EQP-P2", tag: "J-002", name: "Pump 2", type: EquipmentType.PUMP, stationId: "STA-002" }),
      makeEquipment({ id: "EQP-V2", tag: "V-002", name: "Valve 2", type: EquipmentType.VALVE, stationId: "STA-002" }),
    ];

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta1, sta2],
      equipment,
    };

    const tree = deriveEquipmentTree(world);

    // 2 level-1 nodes (stations)
    expect(tree).toHaveLength(2);
    expect(tree[0].level).toBe(1);
    expect(tree[0].entityType).toBe("station");
    expect(tree[0].id).toBe("STA-001");

    // Each level-1 has 2 level-2 children (PUMP + VALVE)
    expect(tree[0].children).toHaveLength(2);
    const l2 = tree[0].children[0];
    expect(l2.level).toBe(2);
    expect(l2.entityType).toBe("category");

    // Level-2 id format: "{stationId}:{equipmentType}"
    const pumpNode = tree[0].children.find((n) => n.equipmentType === EquipmentType.PUMP);
    expect(pumpNode?.id).toBe("STA-001:PUMP");

    // Level-3 nodes are individual equipment items
    expect(pumpNode?.children).toHaveLength(1);
    expect(pumpNode?.children[0].level).toBe(3);
    expect(pumpNode?.children[0].entityType).toBe("equipment");
    expect(pumpNode?.children[0].id).toBe("EQP-P1");
  });

  it("stations ordered by km ascending", () => {
    const sta1 = makeStation("STA-HIGH", 200, "Far Station");
    const sta2 = makeStation("STA-LOW", 10, "Near Station");

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta1, sta2], // out of order by km
      equipment: [],
    };

    const tree = deriveEquipmentTree(world);
    expect(tree[0].id).toBe("STA-LOW"); // km=10 comes first
    expect(tree[1].id).toBe("STA-HIGH"); // km=200 comes second
  });
});

// ============================================================================
// SR-204 Scenarios 6–7 — filterMaintenanceBoardRows
// ============================================================================
describe("filterMaintenanceBoardRows — SR-204 §11", () => {
  function makeRow(overrides: Partial<MaintenanceBoardRow> = {}): MaintenanceBoardRow {
    return {
      taskId: "TSK-001",
      planId: "PLN-001",
      equipmentId: "EQP-001",
      equipmentTag: "J-001",
      equipmentName: "Pump A",
      equipmentType: EquipmentType.PUMP,
      stationId: "STA-001",
      stationName: "Station A",
      taskName: "Lubrication",
      taskStatus: TaskStatus.OK,
      frequency: MaintenanceFrequency.MONTHLY,
      criticality: Criticality.MEDIUM,
      operatingHours: 1000,
      nextDueDate: "2026-07-01",
      priorityScore: 2.0,
      ...overrides,
    };
  }

  // Scenario 6 — intersection filter: station + status
  it("Scenario 6: ANDs station filter with status filter", () => {
    const rows = [
      makeRow({ equipmentId: "EQP-001", stationId: "STA-001", taskStatus: TaskStatus.OVERDUE }),
      makeRow({ equipmentId: "EQP-002", stationId: "STA-001", taskStatus: TaskStatus.OK }),
      makeRow({ equipmentId: "EQP-003", stationId: "STA-002", taskStatus: TaskStatus.OVERDUE }),
    ];

    const filter: MaintenanceBoardFilter = {
      selectionId: "STA-001",
      selectionLevel: "station",
      statusFilter: [TaskStatus.OVERDUE],
    };

    const result = filterMaintenanceBoardRows(rows, filter);
    expect(result).toHaveLength(1);
    expect(result[0].equipmentId).toBe("EQP-001");
  });

  // Scenario 7 — text search (case-insensitive)
  it("Scenario 7: text search is case-insensitive on equipmentName and equipmentTag", () => {
    const rows = [
      makeRow({ equipmentId: "EQP-001", equipmentTag: "J-6010", equipmentName: "Bomba de trasvase" }),
      makeRow({ equipmentId: "EQP-002", equipmentTag: "V-001", equipmentName: "Válvula control" }),
    ];

    const filter: MaintenanceBoardFilter = { searchText: "bomba" };
    const result = filterMaintenanceBoardRows(rows, filter);
    expect(result).toHaveLength(1);
    expect(result[0].equipmentId).toBe("EQP-001");
  });

  it("text search matches on equipmentTag too", () => {
    const rows = [
      makeRow({ equipmentId: "EQP-001", equipmentTag: "J-6010", equipmentName: "Pump" }),
      makeRow({ equipmentId: "EQP-002", equipmentTag: "V-001", equipmentName: "Valve" }),
    ];

    const filter: MaintenanceBoardFilter = { searchText: "J-60" };
    const result = filterMaintenanceBoardRows(rows, filter);
    expect(result).toHaveLength(1);
    expect(result[0].equipmentId).toBe("EQP-001");
  });

  it("category filter uses stationId + selectionEquipmentType", () => {
    const rows = [
      makeRow({ stationId: "STA-001", equipmentId: "EQP-P1", frequency: MaintenanceFrequency.MONTHLY }),
      makeRow({ stationId: "STA-001", equipmentId: "EQP-V1", frequency: MaintenanceFrequency.QUARTERLY }),
      makeRow({ stationId: "STA-002", equipmentId: "EQP-P2", frequency: MaintenanceFrequency.MONTHLY }),
    ];

    // We simulate category filter: stationId "STA-001" + equipmentType PUMP
    // The filter knows the rows' equipmentType via a field we add to the row OR
    // via selectionEquipmentType cross-referenced with equipment data.
    // Per SR-204 §11: filter.selectionEquipmentType required for category
    // and rows must expose their equipment type. We'll add equipmentType to the row fixture.
    const rowsWithType = rows.map((r, i) => ({
      ...r,
      equipmentType: i === 1 ? EquipmentType.VALVE : EquipmentType.PUMP,
    }));

    const filter: MaintenanceBoardFilter = {
      selectionId: "STA-001:PUMP",
      selectionLevel: "category",
      selectionEquipmentType: EquipmentType.PUMP,
      stationId: "STA-001",
    };

    const result = filterMaintenanceBoardRows(
      rowsWithType as MaintenanceBoardRow[],
      filter,
    );
    expect(result).toHaveLength(1);
    expect(result[0].equipmentId).toBe("EQP-P1");
  });

  it("equipment filter keeps only matching equipmentId", () => {
    const rows = [
      makeRow({ equipmentId: "EQP-001" }),
      makeRow({ equipmentId: "EQP-002" }),
    ];
    const filter: MaintenanceBoardFilter = {
      selectionId: "EQP-001",
      selectionLevel: "equipment",
    };
    const result = filterMaintenanceBoardRows(rows, filter);
    expect(result).toHaveLength(1);
    expect(result[0].equipmentId).toBe("EQP-001");
  });

  it("empty filter returns all rows", () => {
    const rows = [makeRow(), makeRow({ equipmentId: "EQP-002" })];
    const filter: MaintenanceBoardFilter = {};
    expect(filterMaintenanceBoardRows(rows, filter)).toHaveLength(2);
  });
});

// ============================================================================
// SR-204 Scenarios 8–9 — bucketTasksByMonth
// ============================================================================
describe("bucketTasksByMonth — SR-204 §12", () => {
  // Scenario 8 — BY_HOURS missing nextDueDate → omit
  it("Scenario 8: BY_HOURS task without nextDueDate is omitted", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const byHoursTask = makeTask({
      id: "T1",
      planId: "P1",
      frequency: MaintenanceFrequency.BY_HOURS,
      nextDueDate: "", // absent / empty
    });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [byHoursTask] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const buckets = bucketTasksByMonth(world, 2026, 6, emptyOverrides());
    // Task with missing nextDueDate must NOT appear
    expect(buckets).toHaveLength(0);
  });

  // Scenario 9 — bucketing by month
  it("Scenario 9: returns only tasks with nextDueDate in the specified year/month", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const juneTask = makeTask({ id: "T1", planId: "P1", nextDueDate: "2026-06-15" });
    const julyTask = makeTask({ id: "T2", planId: "P1", nextDueDate: "2026-07-01" });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [juneTask, julyTask] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [makeStation("STA-001", 10)],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const buckets = bucketTasksByMonth(world, 2026, 6, emptyOverrides());
    expect(buckets).toHaveLength(1);
    expect(buckets[0].taskId).toBe("T1");
    expect(buckets[0].day).toBe(15);
  });

  it("isCompleted is true when override exists for (planId:taskId)", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const task = makeTask({ id: "T1", planId: "P1", nextDueDate: "2026-06-10" });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [task] });

    const overrides: MaintenanceOverrides = {
      workOrderStatuses: {},
      completedTasks: {
        "P1:T1": { completedAt: "2026-06-05", nextDueDate: "2026-07-10" },
      },
    };

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [makeStation("STA-001", 10)],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const buckets = bucketTasksByMonth(world, 2026, 6, overrides);
    expect(buckets[0].isCompleted).toBe(true);
  });
});

// ============================================================================
// SR-204 Scenarios 10–11 — applyWorkOrderTransition
// ============================================================================
describe("applyWorkOrderTransition — SR-204 §13", () => {
  // Scenario 10 — legal transition applies override
  it("Scenario 10: legal transition stores override", () => {
    const wo = makeWorkOrder({ id: "WO-001", status: WorkOrderStatus.PLANNED });
    const overrides = emptyOverrides();

    const result = applyWorkOrderTransition(
      [wo],
      "WO-001",
      WorkOrderStatus.IN_PROGRESS,
      overrides,
    );

    expect(result.workOrderStatuses["WO-001"]).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  // Scenario 11 — illegal transition returns overrides unchanged
  it("Scenario 11: illegal transition (COMPLETED→PLANNED) returns overrides unchanged", () => {
    const wo = makeWorkOrder({ id: "WO-001", status: WorkOrderStatus.COMPLETED });
    const overrides = emptyOverrides();

    const result = applyWorkOrderTransition(
      [wo],
      "WO-001",
      WorkOrderStatus.PLANNED, // illegal
      overrides,
    );

    expect(result.workOrderStatuses).toEqual({});
    expect(result).toBe(overrides); // same reference — not a new object
  });

  it("all legal transitions from PLANNED are accepted", () => {
    const wo = makeWorkOrder({ id: "WO-001", status: WorkOrderStatus.PLANNED });

    const r1 = applyWorkOrderTransition([wo], "WO-001", WorkOrderStatus.IN_PROGRESS, emptyOverrides());
    expect(r1.workOrderStatuses["WO-001"]).toBe(WorkOrderStatus.IN_PROGRESS);

    const r2 = applyWorkOrderTransition([wo], "WO-001", WorkOrderStatus.CANCELLED, emptyOverrides());
    expect(r2.workOrderStatuses["WO-001"]).toBe(WorkOrderStatus.CANCELLED);
  });

  it("all legal transitions from IN_PROGRESS are accepted", () => {
    const wo = makeWorkOrder({ id: "WO-001", status: WorkOrderStatus.IN_PROGRESS });

    for (const newStatus of [WorkOrderStatus.COMPLETED, WorkOrderStatus.ON_HOLD, WorkOrderStatus.CANCELLED]) {
      const r = applyWorkOrderTransition([wo], "WO-001", newStatus, emptyOverrides());
      expect(r.workOrderStatuses["WO-001"]).toBe(newStatus);
    }
  });
});

// ============================================================================
// SR-204 Scenarios 12–14 — applyTaskCompletion
// ============================================================================
describe("applyTaskCompletion — SR-204 §14", () => {
  // Scenario 12 — calendar task recalculates nextDueDate
  it("Scenario 12: calendar (MONTHLY) task recalculates nextDueDate from now", () => {
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });
    const task = makeTask({
      id: "TSK-003",
      planId: "PLN-001",
      frequency: MaintenanceFrequency.MONTHLY,
      nextDueDate: "2026-06-01",
    });
    const plan = makePlan({ id: "PLN-001", equipmentId: "EQP-001", tasks: [task] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const result = applyTaskCompletion(world, "PLN-001", "TSK-003", "2026-06-12", emptyOverrides());

    // nextDueDateByCalendar("2026-06-12", MONTHLY) = "2026-07-12"
    expect(result.completedTasks["PLN-001:TSK-003"].nextDueDate).toBe("2026-07-12");
    expect(result.completedTasks["PLN-001:TSK-003"].completedAt).toBe("2026-06-12");
  });

  // Scenario 13 — BY_HOURS task keeps existing nextDueDate unchanged
  it("Scenario 13: BY_HOURS task keeps existing nextDueDate unchanged", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const task = makeTask({
      id: "TSK-003",
      planId: "PLN-001",
      frequency: MaintenanceFrequency.BY_HOURS,
      nextDueDate: "2026-09-01",
      nextDueAtHours: 3000,
      intervalHours: 2000,
    });
    const plan = makePlan({ id: "PLN-001", equipmentId: "EQP-001", tasks: [task] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const result = applyTaskCompletion(world, "PLN-001", "TSK-003", "2026-06-12", emptyOverrides());
    expect(result.completedTasks["PLN-001:TSK-003"].nextDueDate).toBe("2026-09-01"); // unchanged
  });

  // Scenario 14 — override identity key format
  it("Scenario 14: override key is '{planId}:{taskId}'", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const task = makeTask({ id: "TSK-003", planId: "PLN-001", nextDueDate: "2026-06-15" });
    const plan = makePlan({ id: "PLN-001", equipmentId: "EQP-001", tasks: [task] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const result = applyTaskCompletion(world, "PLN-001", "TSK-003", "2026-06-12", emptyOverrides());
    const key = taskKey("PLN-001", "TSK-003");
    expect(key).toBe("PLN-001:TSK-003");
    expect(result.completedTasks["PLN-001:TSK-003"]).toBeDefined();
  });

  it("returns immutable update — does not mutate input overrides", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const task = makeTask({ id: "TSK-001", planId: "PLN-001", nextDueDate: "2026-06-15" });
    const plan = makePlan({ id: "PLN-001", equipmentId: "EQP-001", tasks: [task] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const original = emptyOverrides();
    const result = applyTaskCompletion(world, "PLN-001", "TSK-001", "2026-06-12", original);
    expect(result).not.toBe(original); // new object returned
    expect(original.completedTasks).toEqual({}); // original untouched
  });
});

// ============================================================================
// C-1 regression: empty nextDueDate in board rows must produce deterministic status
// ============================================================================
describe("deriveMaintenanceBoardRows — C-1: empty nextDueDate handling", () => {
  it("task with empty nextDueDate produces TaskStatus.OK (explicit contract, not NaN fallthrough)", () => {
    const sta = makeStation("STA-001", 10, "Station A");
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });
    // BY_HOURS task with no date seed — the problematic case
    const undatableTask = makeTask({
      id: "T-EMPTY",
      planId: "P1",
      frequency: MaintenanceFrequency.BY_HOURS,
      nextDueDate: "",
      nextDueAtHours: 5000,
      intervalHours: 2000,
    });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [undatableTask] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const rows = deriveMaintenanceBoardRows(world, "2026-06-12", emptyOverrides());
    // Row must be present (equipment appears on the board)
    expect(rows).toHaveLength(1);
    // Status must be TaskStatus.OK per the explicit contract (not a NaN-driven accident)
    expect(rows[0].taskStatus).toBe(TaskStatus.OK);
    // nextDueDate on the row reflects the raw value from the task
    expect(rows[0].nextDueDate).toBe("");
  });

  it("calendar task with empty nextDueDate also produces TaskStatus.OK (not NaN fallthrough)", () => {
    const sta = makeStation("STA-001", 10, "Station A");
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });
    const noDateTask = makeTask({
      id: "T-NODATE",
      planId: "P1",
      frequency: MaintenanceFrequency.MONTHLY,
      nextDueDate: "",
    });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [noDateTask] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const rows = deriveMaintenanceBoardRows(world, "2026-06-12", emptyOverrides());
    expect(rows).toHaveLength(1);
    expect(rows[0].taskStatus).toBe(TaskStatus.OK);
  });
});

// ============================================================================
// C-2 regression: category filter without stationId must return zero rows
// ============================================================================
describe("filterMaintenanceBoardRows — C-2: category without stationId must exclude all", () => {
  function makeRow(overrides: Partial<MaintenanceBoardRow> = {}): MaintenanceBoardRow {
    return {
      taskId: "TSK-001",
      planId: "PLN-001",
      equipmentId: "EQP-001",
      equipmentTag: "J-001",
      equipmentName: "Pump A",
      equipmentType: EquipmentType.PUMP,
      stationId: "STA-001",
      stationName: "Station A",
      taskName: "Lubrication",
      taskStatus: TaskStatus.OK,
      frequency: MaintenanceFrequency.MONTHLY,
      criticality: Criticality.MEDIUM,
      operatingHours: 1000,
      nextDueDate: "2026-07-01",
      priorityScore: 2.0,
      ...overrides,
    };
  }

  it("category filter with selectionEquipmentType but no stationId returns zero rows (SR-204 §11 strict contract)", () => {
    const rows = [
      makeRow({ stationId: "STA-001", equipmentType: EquipmentType.PUMP }),
      makeRow({ stationId: "STA-002", equipmentId: "EQP-002", equipmentType: EquipmentType.PUMP }),
    ];

    // Deliberately omit stationId — this is the cross-station pollution scenario
    const filter: MaintenanceBoardFilter = {
      selectionId: "STA-001:PUMP",
      selectionLevel: "category",
      selectionEquipmentType: EquipmentType.PUMP,
      // stationId intentionally absent
    };

    const result = filterMaintenanceBoardRows(rows, filter);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// W-1 regression: bucketTasksByMonth uses the provided `now` for status, not month-1
// ============================================================================
describe("bucketTasksByMonth — W-1: status computed against real `now`, not month-1", () => {
  it("task overdue relative to now shows OVERDUE even when viewing its (past) month", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    // Task was due 2026-06-05 — it's in June, but it's past relative to now=2026-06-12
    const overdueTask = makeTask({
      id: "T-OD",
      planId: "P1",
      nextDueDate: "2026-06-05",
      frequency: MaintenanceFrequency.MONTHLY,
    });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [overdueTask] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    // View June 2026, real now is 2026-06-12 → task is OVERDUE
    const buckets = bucketTasksByMonth(world, 2026, 6, emptyOverrides(), "2026-06-12");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].taskStatus).toBe(TaskStatus.OVERDUE);
  });

  it("task due 2026-06-03 viewed in June with now=2026-06-01 shows UPCOMING (within 7 days)", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const upcomingTask = makeTask({
      id: "T-UP",
      planId: "P1",
      nextDueDate: "2026-06-03",
      frequency: MaintenanceFrequency.MONTHLY,
    });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [upcomingTask] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const buckets = bucketTasksByMonth(world, 2026, 6, emptyOverrides(), "2026-06-01");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].taskStatus).toBe(TaskStatus.UPCOMING);
  });
});

// ============================================================================
// W-2 regression: applyTaskCompletion preserves "" nextDueDate for BY_HOURS tasks
// ============================================================================
describe("applyTaskCompletion — W-2: BY_HOURS with empty nextDueDate preserves ''", () => {
  it("BY_HOURS task with nextDueDate '' stores '' in the override (not invented date)", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const task = makeTask({
      id: "TSK-HOURS",
      planId: "PLN-001",
      frequency: MaintenanceFrequency.BY_HOURS,
      nextDueDate: "", // no seed date — explicit contract: must stay ""
      nextDueAtHours: 5000,
      intervalHours: 2000,
    });
    const plan = makePlan({ id: "PLN-001", equipmentId: "EQP-001", tasks: [task] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const result = applyTaskCompletion(world, "PLN-001", "TSK-HOURS", "2026-06-12", emptyOverrides());
    // The override must preserve "" — no invention allowed (SR-204 §14)
    expect(result.completedTasks["PLN-001:TSK-HOURS"].nextDueDate).toBe("");
    expect(result.completedTasks["PLN-001:TSK-HOURS"].completedAt).toBe("2026-06-12");
  });
});

// ============================================================================
// S-1: UPCOMING/OK boundary — exactly now+7 days vs now+8 days
// ============================================================================
describe("deriveMaintenanceBoardRows — S-1: UPCOMING/OK boundary", () => {
  it("task due exactly now+7 days shows UPCOMING", () => {
    const sta = makeStation("STA-001", 10, "Station A");
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });
    // now = 2026-06-12, now+7 = 2026-06-19
    const task = makeTask({ id: "T-UP7", planId: "P1", nextDueDate: "2026-06-19" });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [task] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const rows = deriveMaintenanceBoardRows(world, "2026-06-12", emptyOverrides());
    expect(rows[0].taskStatus).toBe(TaskStatus.UPCOMING);
  });

  it("task due now+8 days shows OK", () => {
    const sta = makeStation("STA-001", 10, "Station A");
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });
    // now = 2026-06-12, now+8 = 2026-06-20
    const task = makeTask({ id: "T-OK8", planId: "P1", nextDueDate: "2026-06-20" });
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [task] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const rows = deriveMaintenanceBoardRows(world, "2026-06-12", emptyOverrides());
    expect(rows[0].taskStatus).toBe(TaskStatus.OK);
  });
});

// ============================================================================
// S-3: station-level plan (no equipmentId) produces zero board rows
// ============================================================================
describe("deriveMaintenanceBoardRows — S-3: plan without equipmentId produces zero rows", () => {
  it("station-level plan (no equipmentId) is excluded from board rows", () => {
    const sta = makeStation("STA-001", 10, "Station A");
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });
    const task = makeTask({ id: "T1", planId: "P1", nextDueDate: "2026-07-01" });
    // Plan intentionally has no equipmentId (station-level plan)
    const plan = makePlan({ id: "P1", tasks: [task] }); // no equipmentId

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const rows = deriveMaintenanceBoardRows(world, "2026-06-12", emptyOverrides());
    expect(rows).toHaveLength(0);
  });
});

// ============================================================================
// Additional: deriveMaintenanceBoardRows integration
// ============================================================================
describe("deriveMaintenanceBoardRows — SR-204 §8–10", () => {
  it("returns one row per (plan, task, equipment) triple for active plans with equipmentId", () => {
    const sta = makeStation("STA-001", 10, "Station A");
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });
    const task1 = makeTask({ id: "T1", planId: "P1" });
    const task2 = makeTask({ id: "T2", planId: "P1", nextDueDate: "2026-06-14" }); // upcoming
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [task1, task2] });

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const rows = deriveMaintenanceBoardRows(world, "2026-06-12", emptyOverrides());
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.equipmentId === "EQP-001")).toBe(true);
  });

  it("completed task override changes taskStatus to OK", () => {
    const sta = makeStation("STA-001", 10, "Station A");
    const equipment = makeEquipment({ id: "EQP-001", stationId: "STA-001" });
    const overdueTask = makeTask({ id: "T1", planId: "P1", nextDueDate: "2026-01-01" }); // OVERDUE
    const plan = makePlan({ id: "P1", equipmentId: "EQP-001", tasks: [overdueTask] });

    const overrides: MaintenanceOverrides = {
      workOrderStatuses: {},
      completedTasks: {
        "P1:T1": { completedAt: "2026-06-10", nextDueDate: "2026-07-10" },
      },
    };

    const world: PipelineWorld = {
      ...emptyWorld(),
      stations: [sta],
      equipment: [equipment],
      maintenancePlans: [plan],
    };

    const rows = deriveMaintenanceBoardRows(world, "2026-06-12", overrides);
    expect(rows[0].taskStatus).toBe(TaskStatus.OK);
  });
});

// ============================================================================
// WARNING-4: computeMaintenanceKpis — otAbiertas must respect session overrides
// ============================================================================
describe("computeMaintenanceKpis — WARNING-4: otAbiertas respects WO overrides", () => {
  it("transitioning a WO to COMPLETED via override decrements otAbiertas", () => {
    const workOrders = [
      makeWorkOrder({ id: "WO-1", status: WorkOrderStatus.PLANNED }),
      makeWorkOrder({ id: "WO-2", status: WorkOrderStatus.IN_PROGRESS }),
    ];

    const world: PipelineWorld = { ...emptyWorld(), workOrders };

    // Without overrides: 2 open WOs
    const kpisWithout = computeMaintenanceKpis(world, "2026-06-12", emptyOverrides());
    expect(kpisWithout.otAbiertas).toBe(2);

    // Override WO-1 to COMPLETED
    const overrides: MaintenanceOverrides = {
      workOrderStatuses: { "WO-1": WorkOrderStatus.COMPLETED },
      completedTasks: {},
    };

    const kpisWith = computeMaintenanceKpis(world, "2026-06-12", overrides);
    expect(kpisWith.otAbiertas).toBe(1); // WO-1 is now COMPLETED, only WO-2 is open
  });

  it("overriding a WO to ON_HOLD keeps it in the open count", () => {
    const workOrders = [
      makeWorkOrder({ id: "WO-1", status: WorkOrderStatus.PLANNED }),
    ];
    const world: PipelineWorld = { ...emptyWorld(), workOrders };

    const overrides: MaintenanceOverrides = {
      workOrderStatuses: { "WO-1": WorkOrderStatus.ON_HOLD },
      completedTasks: {},
    };

    const kpis = computeMaintenanceKpis(world, "2026-06-12", overrides);
    expect(kpis.otAbiertas).toBe(1); // ON_HOLD is still open
  });
});

// ============================================================================
// S-2 regression: applyTaskCompletion must return same reference on not-found paths
// ============================================================================
describe("applyTaskCompletion — S-2: same-reference contract on not-found paths", () => {
  it("S-2 regression: returns same overrides reference when plan is not found", () => {
    const world: PipelineWorld = { ...emptyWorld(), maintenancePlans: [] };
    const original = emptyOverrides();
    const result = applyTaskCompletion(world, "PLN-NONEXISTENT", "TSK-001", "2026-06-12", original);
    expect(result).toBe(original); // same reference — no Zustand churn
  });

  it("S-2 regression: returns same overrides reference when task is not found in plan", () => {
    const equipment = makeEquipment({ id: "EQP-001" });
    const plan = makePlan({ id: "PLN-001", equipmentId: "EQP-001", tasks: [] }); // empty tasks
    const world: PipelineWorld = { ...emptyWorld(), equipment: [equipment], maintenancePlans: [plan] };
    const original = emptyOverrides();
    const result = applyTaskCompletion(world, "PLN-001", "TSK-NONEXISTENT", "2026-06-12", original);
    expect(result).toBe(original); // same reference
  });
});

// ============================================================================
// MV-19 — deriveEquipmentHoursOutlook (hours → maintenance exhibit)
// ============================================================================
describe("deriveEquipmentHoursOutlook — MV-19", () => {
  const NOW = "2026-06-12";

  function hoursWorld(equipment: Equipment, plans: MaintenancePlan[]): PipelineWorld {
    return {
      ...emptyWorld(),
      stations: [makeStation("STA-001", 10)],
      equipment: [equipment],
      maintenancePlans: plans,
    };
  }

  it("returns null for an unknown equipment", () => {
    expect(deriveEquipmentHoursOutlook(emptyWorld(), "EQP-404", NOW)).toBeNull();
  });

  it("returns the accumulated hours with no tasks when the equipment has no BY_HOURS plan", () => {
    const equipment = makeEquipment({ operatingHours: 1234 });
    const calendarPlan = makePlan({ equipmentId: "EQP-001", tasks: [makeTask()] });
    const outlook = deriveEquipmentHoursOutlook(hoursWorld(equipment, [calendarPlan]), "EQP-001", NOW);
    expect(outlook).toEqual({ equipmentId: "EQP-001", operatingHours: 1234, tasks: [] });
  });

  it("derives remaining hours and status for a BY_HOURS task", () => {
    const equipment = makeEquipment({ operatingHours: 1500 });
    const plan = makePlan({
      equipmentId: "EQP-001",
      tasks: [
        makeTask({
          id: "TSK-H1",
          frequency: MaintenanceFrequency.BY_HOURS,
          intervalHours: 2000,
          nextDueAtHours: 2000,
          nextDueDate: "2026-12-31", // far future — hours drive the status
        }),
      ],
    });
    const outlook = deriveEquipmentHoursOutlook(hoursWorld(equipment, [plan]), "EQP-001", NOW);
    expect(outlook?.operatingHours).toBe(1500);
    expect(outlook?.tasks).toHaveLength(1);
    expect(outlook?.tasks[0]).toMatchObject({
      taskId: "TSK-H1",
      planId: "PLN-001",
      intervalHours: 2000,
      nextDueAtHours: 2000,
      remainingHours: 500,
      taskStatus: TaskStatus.OK,
    });
  });

  it("flips the task status as accumulated hours approach and cross the due threshold", () => {
    const task = makeTask({
      id: "TSK-H1",
      frequency: MaintenanceFrequency.BY_HOURS,
      intervalHours: 2000,
      nextDueAtHours: 2000,
      nextDueDate: "2026-12-31",
    });
    const plan = makePlan({ equipmentId: "EQP-001", tasks: [task] });

    // Within 10% of the interval (remaining 150 ≤ 200) → UPCOMING
    const upcoming = deriveEquipmentHoursOutlook(
      hoursWorld(makeEquipment({ operatingHours: 1850 }), [plan]),
      "EQP-001",
      NOW,
    );
    expect(upcoming?.tasks[0].taskStatus).toBe(TaskStatus.UPCOMING);
    expect(upcoming?.tasks[0].remainingHours).toBe(150);

    // Past the threshold (remaining −8) → OVERDUE
    const overdue = deriveEquipmentHoursOutlook(
      hoursWorld(makeEquipment({ operatingHours: 2008 }), [plan]),
      "EQP-001",
      NOW,
    );
    expect(overdue?.tasks[0].taskStatus).toBe(TaskStatus.OVERDUE);
    expect(overdue?.tasks[0].remainingHours).toBe(-8);
  });

  it("skips inactive plans and BY_HOURS tasks with incomplete hour metadata", () => {
    const equipment = makeEquipment({ operatingHours: 1500 });
    const inactive = makePlan({
      id: "PLN-OFF",
      equipmentId: "EQP-001",
      isActive: false,
      tasks: [
        makeTask({
          id: "TSK-OFF",
          planId: "PLN-OFF",
          frequency: MaintenanceFrequency.BY_HOURS,
          intervalHours: 2000,
          nextDueAtHours: 2000,
        }),
      ],
    });
    const incomplete = makePlan({
      id: "PLN-INC",
      equipmentId: "EQP-001",
      tasks: [
        makeTask({
          id: "TSK-INC",
          planId: "PLN-INC",
          frequency: MaintenanceFrequency.BY_HOURS,
          // no intervalHours / nextDueAtHours — undatable by usage
        }),
      ],
    });
    const outlook = deriveEquipmentHoursOutlook(
      hoursWorld(equipment, [inactive, incomplete]),
      "EQP-001",
      NOW,
    );
    expect(outlook?.tasks).toEqual([]);
  });
});
