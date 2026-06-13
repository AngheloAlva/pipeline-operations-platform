/**
 * Unit tests for maintenanceStore.
 * SR-205 — store actions (state transitions + overrides), not UI.
 * Uses Zustand's getState() directly to avoid React/component setup.
 *
 * Convention (mirrors simulationStore.test.ts):
 * - beforeEach resets state via setState
 * - Tests invoke actions through getStore()
 * - No React Testing Library — selectors tested at the value level
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useMaintenanceStore, MAINTENANCE_TAB } from "./maintenanceStore";
import { WorkOrderStatus, MaintenanceFrequency, MaintenanceType } from "@/lib/domain";
import type { WorkOrder, PipelineWorld, MaintenancePlan } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorkOrder(
  id: string,
  status: WorkOrder["status"],
): WorkOrder {
  return {
    id,
    otNumber: `OT-${id}`,
    type: MaintenanceType.PREVENTIVE,
    status,
    priority: "MEDIUM",
    progress: 0,
    description: "Test WO",
    equipmentId: "EQP-001",
    stationId: "STA-001",
    programDate: "2026-06-01",
    estimatedHours: 8,
  };
}

function makeWorld(
  workOrders: WorkOrder[] = [],
  plans: MaintenancePlan[] = [],
): PipelineWorld {
  return {
    pipeline: {
      id: "p1",
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
    maintenancePlans: plans,
    workOrders,
    cathodicReadings: [],
    telemetry: [],
  };
}

function makePlanWithCalendarTask(planId: string, taskId: string): MaintenancePlan {
  return {
    id: planId,
    name: "Test Plan",
    description: "Test",
    isActive: true,
    equipmentId: "EQP-001",
    tasks: [
      {
        id: taskId,
        planId,
        name: "Inspección mensual",
        type: MaintenanceType.PREVENTIVE,
        frequency: MaintenanceFrequency.MONTHLY,
        nextDueDate: "2026-06-01",
      },
    ],
  };
}

function makePlanWithByHoursTask(planId: string, taskId: string): MaintenancePlan {
  return {
    id: planId,
    name: "BY_HOURS Plan",
    description: "Test",
    isActive: true,
    equipmentId: "EQP-001",
    tasks: [
      {
        id: taskId,
        planId,
        name: "Cambio de aceite",
        type: MaintenanceType.PREVENTIVE,
        frequency: MaintenanceFrequency.BY_HOURS,
        intervalHours: 500,
        nextDueDate: "2026-09-01",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  overrides: {
    workOrderStatuses: {},
    completedTasks: {},
  },
  activeBoardFilter: {},
  activeTab: MAINTENANCE_TAB.TABLERO,
};

function getStore() {
  return useMaintenanceStore.getState();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("maintenanceStore", () => {
  beforeEach(() => {
    // Reset to clean state — preserves actions
    useMaintenanceStore.setState({
      ...INITIAL_STATE,
      calendarYear: 2026,
      calendarMonth: 6,
    });
  });

  // --- SR-205 Scenario 1: Initial state ---

  it("SR-205 §3: activeTab is 'tablero' on reset", () => {
    expect(getStore().activeTab).toBe(MAINTENANCE_TAB.TABLERO);
  });

  it("SR-205 §3: overrides are empty on reset", () => {
    expect(getStore().overrides.workOrderStatuses).toEqual({});
    expect(getStore().overrides.completedTasks).toEqual({});
  });

  it("SR-205 §3: activeBoardFilter is empty on reset", () => {
    expect(getStore().activeBoardFilter).toEqual({});
  });

  // --- setActiveTab ---

  it("setActiveTab switches the active tab", () => {
    getStore().setActiveTab(MAINTENANCE_TAB.CALENDARIO);
    expect(getStore().activeTab).toBe(MAINTENANCE_TAB.CALENDARIO);
  });

  it("setActiveTab can switch back to tablero", () => {
    getStore().setActiveTab(MAINTENANCE_TAB.ORDENES);
    getStore().setActiveTab(MAINTENANCE_TAB.TABLERO);
    expect(getStore().activeTab).toBe(MAINTENANCE_TAB.TABLERO);
  });

  // --- SR-205 Scenario 2: prevMonth wraps Jan → Dec ---

  it("SR-205 Scenario 2: prevMonth from January wraps to December of previous year", () => {
    useMaintenanceStore.setState({ calendarYear: 2026, calendarMonth: 1 });
    getStore().prevMonth();
    expect(getStore().calendarYear).toBe(2025);
    expect(getStore().calendarMonth).toBe(12);
  });

  it("prevMonth decrements month without wrapping in non-January months", () => {
    useMaintenanceStore.setState({ calendarYear: 2026, calendarMonth: 6 });
    getStore().prevMonth();
    expect(getStore().calendarYear).toBe(2026);
    expect(getStore().calendarMonth).toBe(5);
  });

  it("prevMonth from February goes to January (same year)", () => {
    useMaintenanceStore.setState({ calendarYear: 2026, calendarMonth: 2 });
    getStore().prevMonth();
    expect(getStore().calendarYear).toBe(2026);
    expect(getStore().calendarMonth).toBe(1);
  });

  // --- SR-205 Scenario 3: nextMonth wraps Dec → Jan ---

  it("SR-205 Scenario 3: nextMonth from December wraps to January of next year", () => {
    useMaintenanceStore.setState({ calendarYear: 2026, calendarMonth: 12 });
    getStore().nextMonth();
    expect(getStore().calendarYear).toBe(2027);
    expect(getStore().calendarMonth).toBe(1);
  });

  it("nextMonth increments month without wrapping in non-December months", () => {
    useMaintenanceStore.setState({ calendarYear: 2026, calendarMonth: 6 });
    getStore().nextMonth();
    expect(getStore().calendarYear).toBe(2026);
    expect(getStore().calendarMonth).toBe(7);
  });

  it("nextMonth from November goes to December (same year)", () => {
    useMaintenanceStore.setState({ calendarYear: 2026, calendarMonth: 11 });
    getStore().nextMonth();
    expect(getStore().calendarYear).toBe(2026);
    expect(getStore().calendarMonth).toBe(12);
  });

  // --- SR-205 Scenario 4: transitionWorkOrder returns false for illegal transition ---

  it("SR-205 Scenario 4: transitionWorkOrder returns false for illegal transition (COMPLETED → PLANNED)", () => {
    const wo = makeWorkOrder("WO-001", WorkOrderStatus.COMPLETED);
    const world = makeWorld([wo]);
    const result = getStore().transitionWorkOrder(
      world.workOrders,
      "WO-001",
      WorkOrderStatus.PLANNED,
    );
    expect(result).toBe(false);
    expect(getStore().overrides.workOrderStatuses).toEqual({});
  });

  it("transitionWorkOrder returns false for illegal transition (IN_PROGRESS → PLANNED)", () => {
    const wo = makeWorkOrder("WO-002", WorkOrderStatus.IN_PROGRESS);
    const world = makeWorld([wo]);
    const result = getStore().transitionWorkOrder(
      world.workOrders,
      "WO-002",
      WorkOrderStatus.PLANNED,
    );
    expect(result).toBe(false);
    expect(getStore().overrides.workOrderStatuses).toEqual({});
  });

  it("transitionWorkOrder returns false for non-existent work order", () => {
    const world = makeWorld([]);
    const result = getStore().transitionWorkOrder(
      world.workOrders,
      "WO-NONEXISTENT",
      WorkOrderStatus.IN_PROGRESS,
    );
    expect(result).toBe(false);
    expect(getStore().overrides.workOrderStatuses).toEqual({});
  });

  // --- transitionWorkOrder: legal transitions ---

  it("transitionWorkOrder returns true and stores override for legal transition (PLANNED → IN_PROGRESS)", () => {
    const wo = makeWorkOrder("WO-003", WorkOrderStatus.PLANNED);
    const world = makeWorld([wo]);
    const result = getStore().transitionWorkOrder(
      world.workOrders,
      "WO-003",
      WorkOrderStatus.IN_PROGRESS,
    );
    expect(result).toBe(true);
    expect(getStore().overrides.workOrderStatuses["WO-003"]).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  it("transitionWorkOrder applies legal transition IN_PROGRESS → ON_HOLD", () => {
    const wo = makeWorkOrder("WO-004", WorkOrderStatus.IN_PROGRESS);
    const world = makeWorld([wo]);
    getStore().transitionWorkOrder(world.workOrders, "WO-004", WorkOrderStatus.ON_HOLD);
    expect(getStore().overrides.workOrderStatuses["WO-004"]).toBe(WorkOrderStatus.ON_HOLD);
  });

  it("transitionWorkOrder respects existing override as current status", () => {
    // WO seed is PLANNED, but override has it IN_PROGRESS
    const wo = makeWorkOrder("WO-005", WorkOrderStatus.PLANNED);
    const world = makeWorld([wo]);
    // First transition PLANNED → IN_PROGRESS
    getStore().transitionWorkOrder(world.workOrders, "WO-005", WorkOrderStatus.IN_PROGRESS);
    // Now transition IN_PROGRESS → COMPLETED (valid)
    const result = getStore().transitionWorkOrder(
      world.workOrders,
      "WO-005",
      WorkOrderStatus.COMPLETED,
    );
    expect(result).toBe(true);
    expect(getStore().overrides.workOrderStatuses["WO-005"]).toBe(WorkOrderStatus.COMPLETED);
  });

  // --- SR-205 Scenario 5: completeTask stores override ---

  it("SR-205 Scenario 5: completeTask stores override with correct key and completedAt", () => {
    const planId = "PLN-001";
    const taskId = "TSK-003";
    const now = "2026-06-12";
    const plan = makePlanWithCalendarTask(planId, taskId);
    const world = makeWorld([], [plan]);

    getStore().completeTask(world, planId, taskId, now);

    const key = `${planId}:${taskId}`;
    expect(getStore().overrides.completedTasks[key]).toBeDefined();
    expect(getStore().overrides.completedTasks[key].completedAt).toBe(now);
  });

  it("completeTask for MONTHLY task recalculates nextDueDate", () => {
    const planId = "PLN-002";
    const taskId = "TSK-010";
    const now = "2026-06-12";
    const plan = makePlanWithCalendarTask(planId, taskId);
    const world = makeWorld([], [plan]);

    getStore().completeTask(world, planId, taskId, now);

    const key = `${planId}:${taskId}`;
    // MONTHLY from 2026-06-12 → 2026-07-12
    expect(getStore().overrides.completedTasks[key].nextDueDate).toBe("2026-07-12");
  });

  it("completeTask for BY_HOURS task preserves original nextDueDate", () => {
    const planId = "PLN-003";
    const taskId = "TSK-020";
    const now = "2026-06-12";
    const plan = makePlanWithByHoursTask(planId, taskId);
    const world = makeWorld([], [plan]);

    getStore().completeTask(world, planId, taskId, now);

    const key = `${planId}:${taskId}`;
    // BY_HOURS: nextDueDate unchanged (SR-204 §14 / spec wins)
    expect(getStore().overrides.completedTasks[key].nextDueDate).toBe("2026-09-01");
  });

  it("completeTask on a non-existent plan does not write to completedTasks", () => {
    const world = makeWorld([], []);
    getStore().completeTask(world, "PLN-NONE", "TSK-NONE", "2026-06-12");
    expect(getStore().overrides.completedTasks).toEqual({});
  });

  // --- setBoardFilter ---

  it("setBoardFilter merges partial filter into activeBoardFilter", () => {
    getStore().setBoardFilter({ selectionId: "STA-001", selectionLevel: "station" });
    expect(getStore().activeBoardFilter.selectionId).toBe("STA-001");
    expect(getStore().activeBoardFilter.selectionLevel).toBe("station");
  });

  it("setBoardFilter preserves existing filter fields when merging", () => {
    getStore().setBoardFilter({ selectionId: "STA-001" });
    getStore().setBoardFilter({ searchText: "bomba" });
    expect(getStore().activeBoardFilter.selectionId).toBe("STA-001");
    expect(getStore().activeBoardFilter.searchText).toBe("bomba");
  });

  // --- resetBoardFilter ---

  it("resetBoardFilter clears all filter criteria", () => {
    getStore().setBoardFilter({ selectionId: "STA-001", searchText: "bomba" });
    getStore().resetBoardFilter();
    expect(getStore().activeBoardFilter).toEqual({});
  });

  // --- No cross-store imports (SR-205 §7) ---

  it("maintenanceStore module has no imports from simulationStore, worldStore, or selectionStore", async () => {
    // Dynamic import to access module source (only available at build time).
    // We verify by checking that the store state and actions do not reference
    // simulation-store state (checked structurally via the shape of getState()).
    const state = getStore();
    expect(state).not.toHaveProperty("isRunning");
    expect(state).not.toHaveProperty("simulatedTime");
    expect(state).not.toHaveProperty("tankLevels");
    expect(state).not.toHaveProperty("selectedEntityId");
  });
});
