/**
 * Maintenance store — session-only Zustand slice.
 * SR-205: holds ONLY user overrides (WO transitions + task completions).
 * No derived data, no persist middleware, no cross-store imports.
 *
 * Design:
 * - State: overrides (workOrderStatuses + completedTasks), activeBoardFilter,
 *   activeTab, calendarYear, calendarMonth.
 * - Actions call pure selectors from lib/maintenance/selectors.ts.
 * - No imports from simulationStore, worldStore, or selectionStore (ADR-7, SR-205 §7).
 */

import { create } from "zustand";
import type { WorkOrder, WorkOrderStatus } from "@/lib/domain";
import type {
  MaintenanceBoardFilter,
  MaintenanceOverrides,
} from "@/lib/maintenance/selectors";
import {
  applyWorkOrderTransition,
  applyTaskCompletion,
} from "@/lib/maintenance/selectors";
import type { PipelineWorld } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Active tab identifier for the maintenance page (SR-205 §2). */
export const MAINTENANCE_TAB = {
  TABLERO: "tablero",
  CALENDARIO: "calendario",
  ORDENES: "ordenes",
} as const;
export type MaintenanceTab = (typeof MAINTENANCE_TAB)[keyof typeof MAINTENANCE_TAB];

/** Empty overrides — used for initial state and reset. */
const EMPTY_OVERRIDES: MaintenanceOverrides = {
  workOrderStatuses: {},
  completedTasks: {},
};

/** Empty board filter — used for initial state and reset. */
const EMPTY_BOARD_FILTER: MaintenanceBoardFilter = {};

/** Derive today's year and month (1-based) at store initialization time. */
function getTodayYearMonth(): { calendarYear: number; calendarMonth: number } {
  const now = new Date();
  return {
    calendarYear: now.getFullYear(),
    calendarMonth: now.getMonth() + 1, // 1-based (SR-205 §2)
  };
}

// ---------------------------------------------------------------------------
// State and actions interfaces
// ---------------------------------------------------------------------------

interface MaintenanceState {
  /** Session-only overrides: WO status transitions + task completions. */
  overrides: MaintenanceOverrides;
  /** Active board filter criteria. */
  activeBoardFilter: MaintenanceBoardFilter;
  /** Currently visible tab on the maintenance page. */
  activeTab: MaintenanceTab;
  /** Calendar year being displayed (1-based month). */
  calendarYear: number;
  /** Calendar month being displayed (1-based). */
  calendarMonth: number;
}

interface MaintenanceActions {
  /** Switch the active maintenance tab. */
  setActiveTab: (tab: MaintenanceTab) => void;
  /**
   * Navigate to the previous calendar month.
   * January (1) wraps back to December (12) of the previous year (SR-205 §4).
   */
  prevMonth: () => void;
  /**
   * Navigate to the next calendar month.
   * December (12) wraps forward to January (1) of the next year (SR-205 §4).
   */
  nextMonth: () => void;
  /**
   * Attempt a work-order status transition.
   *
   * The selector validates legality based on the effective current status
   * (override first, then seed). If illegal, overrides are unchanged.
   *
   * @param workOrders - Seed work orders (caller provides world access; store stays decoupled).
   * @param id - Work order id.
   * @param newStatus - Desired new status.
   * @returns true if the transition was applied, false if it was rejected.
   */
  transitionWorkOrder: (
    workOrders: WorkOrder[],
    id: string,
    newStatus: WorkOrderStatus,
  ) => boolean;
  /**
   * Mark a task as completed and store the computed next due date.
   *
   * @param world - Full pipeline world (caller provides; store stays decoupled).
   * @param planId - Maintenance plan id.
   * @param taskId - Task id within the plan.
   * @param now - Current date as ISO string (YYYY-MM-DD).
   */
  completeTask: (
    world: PipelineWorld,
    planId: string,
    taskId: string,
    now: string,
  ) => void;
  /**
   * Partially merge a filter into activeBoardFilter.
   */
  setBoardFilter: (filter: Partial<MaintenanceBoardFilter>) => void;
  /**
   * Reset activeBoardFilter to the empty/default state.
   */
  resetBoardFilter: () => void;
}

export type MaintenanceStore = MaintenanceState & MaintenanceActions;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMaintenanceStore = create<MaintenanceStore>((set, get) => ({
  // --- Initial state (SR-205 §3) ---
  overrides: EMPTY_OVERRIDES,
  activeBoardFilter: EMPTY_BOARD_FILTER,
  activeTab: MAINTENANCE_TAB.TABLERO,
  ...getTodayYearMonth(),

  // --- Actions ---

  setActiveTab: (tab) => set({ activeTab: tab }),

  prevMonth: () => {
    const { calendarYear, calendarMonth } = get();
    if (calendarMonth === 1) {
      // January → December of the previous year (SR-205 Scenario 2)
      set({ calendarYear: calendarYear - 1, calendarMonth: 12 });
    } else {
      set({ calendarMonth: calendarMonth - 1 });
    }
  },

  nextMonth: () => {
    const { calendarYear, calendarMonth } = get();
    if (calendarMonth === 12) {
      // December → January of the next year (SR-205 Scenario 3)
      set({ calendarYear: calendarYear + 1, calendarMonth: 1 });
    } else {
      set({ calendarMonth: calendarMonth + 1 });
    }
  },

  transitionWorkOrder: (workOrders, id, newStatus) => {
    const { overrides } = get();
    const next = applyWorkOrderTransition(workOrders, id, newStatus, overrides);
    // Detect whether the transition was applied via reference identity.
    // applyWorkOrderTransition returns the same reference on illegal transitions
    // (including self-transitions), so reference inequality is the correct signal.
    const wasApplied = next !== overrides;
    if (wasApplied) set({ overrides: next });
    return wasApplied;
  },

  completeTask: (world, planId, taskId, now) => {
    const { overrides } = get();
    const next = applyTaskCompletion(world, planId, taskId, now, overrides);
    set({ overrides: next });
  },

  setBoardFilter: (filter) => {
    const { activeBoardFilter } = get();
    set({ activeBoardFilter: { ...activeBoardFilter, ...filter } });
  },

  resetBoardFilter: () => set({ activeBoardFilter: EMPTY_BOARD_FILTER }),
}));
