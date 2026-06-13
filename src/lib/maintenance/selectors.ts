/**
 * Pure selector helpers for the CMMS maintenance module.
 * All functions are pure: no side effects, no store imports, no React dependencies.
 * Implements SR-204 requirements.
 */

import type { PipelineWorld, WorkOrder, WorkOrderStatus } from "@/lib/domain";
import { EquipmentType, MaintenanceFrequency, WorkOrderStatus as WorkOrderStatusValues, Criticality } from "@/lib/domain";
import type { Criticality as CriticalityType } from "@/lib/domain";
import { taskStatus, maintenancePriorityScore, nextDueDateByCalendar } from "./scheduling";
import { TaskStatus } from "./scheduling";
import type { TaskStatus as TaskStatusType } from "./scheduling";

// ============================================================================
// TYPES
// ============================================================================

/** KPI summary for the maintenance module (SR-204 §1). */
export interface MaintenanceKpis {
  vencidas: number;
  proximas: number;
  otAbiertas: number;
  equiposCriticos: number;
}

/** A node in the 3-level equipment tree (SR-204 §7). */
export interface EquipmentTreeNode {
  id: string;
  label: string;
  level: 1 | 2 | 3;
  entityType: "station" | "category" | "equipment";
  stationId: string;
  equipmentType?: EquipmentType;
  equipmentId?: string;
  children: EquipmentTreeNode[];
}

/** A derived board row — one per (plan, task, equipment) triple (SR-204 §8). */
export interface MaintenanceBoardRow {
  taskId: string;
  planId: string;
  equipmentId: string;
  equipmentTag: string;
  equipmentName: string;
  equipmentType: EquipmentType;
  stationId: string;
  stationName: string;
  taskName: string;
  taskStatus: TaskStatusType;
  frequency: MaintenanceFrequency;
  criticality: CriticalityType;
  operatingHours: number;
  nextDueDate: string;
  priorityScore: number;
}

/** Filter criteria for the board (SR-204 §11). */
export interface MaintenanceBoardFilter {
  selectionId?: string;
  selectionLevel?: "station" | "category" | "equipment";
  selectionEquipmentType?: EquipmentType;
  stationId?: string;
  statusFilter?: TaskStatusType[];
  searchText?: string;
}

/** A calendar bucket entry — one per (task, plan) with nextDueDate in month (SR-204 §12). */
export interface CalendarBucket {
  day: number;
  taskId: string;
  planId: string;
  equipmentId?: string;
  taskName: string;
  frequency: MaintenanceFrequency;
  taskStatus: TaskStatusType;
  isCompleted: boolean;
}

/** Session overrides for maintenance state (SR-205 §2). */
export interface MaintenanceOverrides {
  workOrderStatuses: Record<string, WorkOrderStatus>;
  completedTasks: Record<string, { completedAt: string; nextDueDate: string }>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Legal WO transitions table (SR-204 §13). */
const WORK_ORDER_TRANSITIONS: Record<string, WorkOrderStatus[]> = {
  [WorkOrderStatusValues.PLANNED]: [WorkOrderStatusValues.IN_PROGRESS, WorkOrderStatusValues.CANCELLED],
  [WorkOrderStatusValues.IN_PROGRESS]: [
    WorkOrderStatusValues.COMPLETED,
    WorkOrderStatusValues.ON_HOLD,
    WorkOrderStatusValues.CANCELLED,
  ],
  [WorkOrderStatusValues.ON_HOLD]: [WorkOrderStatusValues.IN_PROGRESS],
  [WorkOrderStatusValues.COMPLETED]: [],
  [WorkOrderStatusValues.CANCELLED]: [],
};

// ============================================================================
// HELPERS
// ============================================================================

/** Composite override key for a (planId, taskId) pair (SR-204 §14, ADR-2). */
export function taskKey(planId: string, taskId: string): string {
  return `${planId}:${taskId}`;
}

/**
 * Check if a WO transition is legal per the state machine.
 * Returns the new list of legal target statuses, or [] for terminal states.
 */
function canTransition(currentStatus: WorkOrderStatus, newStatus: WorkOrderStatus): boolean {
  const allowed = WORK_ORDER_TRANSITIONS[currentStatus] ?? [];
  return allowed.includes(newStatus);
}

// ============================================================================
// TASK 1.3 — computeMaintenanceKpis
// ============================================================================

/**
 * Compute KPI summary from world state (SR-204 §1–6).
 *
 * - vencidas: OVERDUE tasks across active plans (equipment-level plans use equipment.operatingHours)
 * - proximas: UPCOMING tasks across active plans
 * - otAbiertas: WorkOrders in {PLANNED, IN_PROGRESS, ON_HOLD} — respects session overrides
 * - equiposCriticos: Equipment with criticality === CRITICAL
 *
 * @param world - Full pipeline world state
 * @param now - Current date as ISO string (YYYY-MM-DD)
 * @param overrides - Session overrides; WO status override takes precedence over seed status
 */
export function computeMaintenanceKpis(
  world: PipelineWorld,
  now: string,
  overrides: MaintenanceOverrides = { workOrderStatuses: {}, completedTasks: {} },
): MaintenanceKpis {
  // Build equipment lookup map for fast access
  const equipmentById = new Map(world.equipment.map((e) => [e.id, e]));

  let vencidas = 0;
  let proximas = 0;

  // Only active plans (SR-204 §6)
  for (const plan of world.maintenancePlans) {
    if (!plan.isActive) continue;

    const equipment = plan.equipmentId ? equipmentById.get(plan.equipmentId) : undefined;
    const currentHours = equipment?.operatingHours;

    for (const task of plan.tasks) {
      const status = taskStatus(task, now, currentHours);
      if (status === TaskStatus.OVERDUE) vencidas++;
      else if (status === TaskStatus.UPCOMING) proximas++;
    }
  }

  // otAbiertas: WOs with open status (SR-204 §4) — override takes precedence over seed
  const openStatuses = new Set<WorkOrderStatus>([
    WorkOrderStatusValues.PLANNED,
    WorkOrderStatusValues.IN_PROGRESS,
    WorkOrderStatusValues.ON_HOLD,
  ]);
  const otAbiertas = world.workOrders.filter((wo) => {
    const effectiveStatus: WorkOrderStatus =
      wo.id in overrides.workOrderStatuses ? overrides.workOrderStatuses[wo.id] : wo.status;
    return openStatuses.has(effectiveStatus);
  }).length;

  // equiposCriticos: equipment with CRITICAL criticality (SR-204 §5)
  const equiposCriticos = world.equipment.filter(
    (e) => e.criticality === Criticality.CRITICAL,
  ).length;

  return { vencidas, proximas, otAbiertas, equiposCriticos };
}

// ============================================================================
// TASK 1.4 — deriveEquipmentTree
// ============================================================================

/**
 * Derive 3-level equipment tree from world (SR-204 §7).
 *
 * Level 1: stations ordered by km ascending
 * Level 2: distinct EquipmentType per station, alphabetical by type string
 * Level 3: individual equipment items ordered by tag ascending
 *
 * @param world - Full pipeline world state
 */
export function deriveEquipmentTree(world: PipelineWorld): EquipmentTreeNode[] {
  // Group equipment by stationId
  const byStation = new Map<string, typeof world.equipment>();
  for (const eq of world.equipment) {
    if (!byStation.has(eq.stationId)) byStation.set(eq.stationId, []);
    byStation.get(eq.stationId)!.push(eq);
  }

  // Sort stations by km ascending
  const sortedStations = [...world.stations].sort((a, b) => a.km - b.km);

  return sortedStations.map((station): EquipmentTreeNode => {
    const stationEquipment = byStation.get(station.id) ?? [];

    // Collect distinct equipment types, sorted alphabetically
    const typesSet = new Set(stationEquipment.map((e) => e.type));
    const sortedTypes = [...typesSet].sort();

    const categoryNodes = sortedTypes.map((eqType): EquipmentTreeNode => {
      // Equipment items of this type at this station, sorted by tag
      const items = stationEquipment
        .filter((e) => e.type === eqType)
        .sort((a, b) => a.tag.localeCompare(b.tag));

      const leafNodes = items.map((eq): EquipmentTreeNode => ({
        id: eq.id,
        label: `${eq.tag} — ${eq.name}`,
        level: 3,
        entityType: "equipment",
        stationId: station.id,
        equipmentType: eqType as EquipmentType,
        equipmentId: eq.id,
        children: [],
      }));

      return {
        id: `${station.id}:${eqType}`,
        label: eqType, // Spanish display name can be applied in component
        level: 2,
        entityType: "category",
        stationId: station.id,
        equipmentType: eqType as EquipmentType,
        children: leafNodes,
      };
    });

    return {
      id: station.id,
      label: station.name,
      level: 1,
      entityType: "station",
      stationId: station.id,
      children: categoryNodes,
    };
  });
}

// ============================================================================
// TASK 1.5 — deriveMaintenanceBoardRows
// ============================================================================

/**
 * Derive board rows from world + overrides (SR-204 §8–10).
 *
 * One row per (plan, task, equipment) triple for active plans with equipmentId.
 * Applies session overrides: completed tasks get taskStatus === OK.
 *
 * @param world - Full pipeline world state
 * @param now - Current date as ISO string (YYYY-MM-DD)
 * @param overrides - Session overrides (completed tasks, WO status changes)
 */
export function deriveMaintenanceBoardRows(
  world: PipelineWorld,
  now: string,
  overrides: MaintenanceOverrides,
): MaintenanceBoardRow[] {
  const equipmentById = new Map(world.equipment.map((e) => [e.id, e]));
  const stationById = new Map(world.stations.map((s) => [s.id, s]));

  const rows: MaintenanceBoardRow[] = [];

  for (const plan of world.maintenancePlans) {
    if (!plan.isActive) continue;
    if (!plan.equipmentId) continue; // only equipment-level plans for the board

    const equipment = equipmentById.get(plan.equipmentId);
    if (!equipment) continue;

    const station = stationById.get(equipment.stationId);

    for (const task of plan.tasks) {
      const key = taskKey(plan.id, task.id);
      const isCompleted = key in overrides.completedTasks;

      // Completed override → always OK.
      // Guard empty nextDueDate BEFORE calling taskStatus: parseDate("") → Invalid Date
      // → NaN comparisons → silent fall-through to OK. We make this explicit:
      // Contract (SR-204 §8, obs #2390): tasks with no date seed are undatable but
      // the equipment MUST appear on the board. Classify as OK explicitly.
      const hasDate = task.nextDueDate.trim() !== "";
      const status: TaskStatusType = isCompleted
        ? TaskStatus.OK
        : hasDate
          ? taskStatus(task, now, equipment.operatingHours)
          : TaskStatus.OK; // explicit: undatable task → OK, not NaN fallthrough

      const score = maintenancePriorityScore(task, equipment, now);

      rows.push({
        taskId: task.id,
        planId: plan.id,
        equipmentId: equipment.id,
        equipmentTag: equipment.tag,
        equipmentName: equipment.name,
        equipmentType: equipment.type,
        stationId: equipment.stationId,
        stationName: station?.name ?? equipment.stationId,
        taskName: task.name,
        taskStatus: status,
        frequency: task.frequency,
        criticality: equipment.criticality,
        operatingHours: equipment.operatingHours,
        nextDueDate: task.nextDueDate,
        priorityScore: score,
      });
    }
  }

  return rows;
}

// ============================================================================
// TASK 1.6 — filterMaintenanceBoardRows
// ============================================================================

/**
 * Filter board rows by active criteria — AND intersection logic (SR-204 §11).
 *
 * @param rows - Derived board rows from deriveMaintenanceBoardRows
 * @param filter - Active filter criteria
 */
export function filterMaintenanceBoardRows(
  rows: MaintenanceBoardRow[],
  filter: MaintenanceBoardFilter,
): MaintenanceBoardRow[] {
  return rows.filter((row) => {
    // Selection filter
    if (filter.selectionId && filter.selectionLevel) {
      switch (filter.selectionLevel) {
        case "equipment":
          if (row.equipmentId !== filter.selectionId) return false;
          break;
        case "station":
          if (row.stationId !== filter.selectionId) return false;
          break;
        case "category":
          // Must match stationId AND equipmentType (SR-204 §11).
          // A category is defined as the intersection of (station × type):
          // if stationId is absent the category is unresolvable → exclude all.
          if (!filter.stationId) return false;
          if (row.stationId !== filter.stationId) return false;
          if (
            filter.selectionEquipmentType &&
            row.equipmentType !== filter.selectionEquipmentType
          ) {
            return false;
          }
          break;
      }
    }

    // Status filter (multi-select OR within the filter, AND with other filters)
    if (filter.statusFilter && filter.statusFilter.length > 0) {
      if (!filter.statusFilter.includes(row.taskStatus)) return false;
    }

    // Text search — case-insensitive on tag or name
    if (filter.searchText && filter.searchText.trim() !== "") {
      const needle = filter.searchText.trim().toLowerCase();
      const haystack = `${row.equipmentTag} ${row.equipmentName}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

// ============================================================================
// TASK 1.7 — bucketTasksByMonth
// ============================================================================

/**
 * Bucket tasks by year/month for the calendar view (SR-204 §12).
 *
 * BY_HOURS tasks: use task.nextDueDate (seed estimate); if absent/invalid → OMIT.
 * Calendar tasks: use task.nextDueDate directly.
 * month is 1-based (1 = January).
 *
 * @param world - Full pipeline world state
 * @param year - Target calendar year
 * @param month - Target calendar month (1-based)
 * @param overrides - Session overrides for isCompleted flag
 * @param now - Current date as ISO string (YYYY-MM-DD); used for taskStatus computation.
 *              Month boundaries still use year/month args. Defaults to the 1st of the
 *              target month when omitted (legacy behaviour, calendar badges may diverge
 *              from KPI counts — always pass `now` for correct status display).
 */
export function bucketTasksByMonth(
  world: PipelineWorld,
  year: number,
  month: number,
  overrides: MaintenanceOverrides,
  now?: string,
): CalendarBucket[] {
  const equipmentById = new Map(world.equipment.map((e) => [e.id, e]));
  const buckets: CalendarBucket[] = [];

  // Use the caller-supplied `now` for status computation.
  // Fallback to the 1st of the target month only when `now` is not provided.
  // NOTE: omitting `now` means calendar badges may disagree with KPI counts
  // because taskStatus uses the month-1 anchor instead of the real current date.
  const nowRef = now ?? `${year}-${String(month).padStart(2, "0")}-01`;

  for (const plan of world.maintenancePlans) {
    if (!plan.isActive) continue;

    const equipment = plan.equipmentId ? equipmentById.get(plan.equipmentId) : undefined;
    const currentHours = equipment?.operatingHours;

    for (const task of plan.tasks) {
      // Validate nextDueDate
      if (!task.nextDueDate || task.nextDueDate.trim() === "") {
        // BY_HOURS with no date → omit (SR-204 §12)
        continue;
      }

      const parts = task.nextDueDate.split("-");
      if (parts.length !== 3) continue; // unparseable → omit

      const taskYear = parseInt(parts[0], 10);
      const taskMonth = parseInt(parts[1], 10);
      const taskDay = parseInt(parts[2], 10);

      if (isNaN(taskYear) || isNaN(taskMonth) || isNaN(taskDay)) continue;
      if (taskYear !== year || taskMonth !== month) continue;

      const key = taskKey(plan.id, task.id);
      const isCompleted = key in overrides.completedTasks;
      const status = taskStatus(task, nowRef, currentHours);

      buckets.push({
        day: taskDay,
        taskId: task.id,
        planId: plan.id,
        equipmentId: plan.equipmentId,
        taskName: task.name,
        frequency: task.frequency,
        taskStatus: status,
        isCompleted,
      });
    }
  }

  return buckets;
}

// ============================================================================
// TASK 1.8 — applyWorkOrderTransition
// ============================================================================

/**
 * Apply a work-order status transition and return new overrides (SR-204 §13).
 *
 * Illegal transitions are silently ignored — returns overrides unchanged.
 * Legal transitions update overrides.workOrderStatuses.
 *
 * @param workOrders - Full list of work orders (to look up current effective status)
 * @param id - Target work order id
 * @param newStatus - Desired new status
 * @param overrides - Current session overrides
 */
export function applyWorkOrderTransition(
  workOrders: WorkOrder[],
  id: string,
  newStatus: WorkOrderStatus,
  overrides: MaintenanceOverrides,
): MaintenanceOverrides {
  const wo = workOrders.find((w) => w.id === id);
  if (!wo) return overrides;

  // Effective current status: override takes precedence over seed
  const currentStatus: WorkOrderStatus =
    id in overrides.workOrderStatuses ? overrides.workOrderStatuses[id] : wo.status;

  if (!canTransition(currentStatus, newStatus)) {
    return overrides; // same reference — illegal transition ignored
  }

  return {
    ...overrides,
    workOrderStatuses: {
      ...overrides.workOrderStatuses,
      [id]: newStatus,
    },
  };
}

// ============================================================================
// TASK 1.9 — applyTaskCompletion
// ============================================================================

/**
 * Mark a task completed and compute new nextDueDate (SR-204 §14).
 *
 * - Calendar tasks: nextDueDate = nextDueDateByCalendar(now, frequency)
 * - BY_HOURS tasks: nextDueDate = existing task.nextDueDate unchanged
 *
 * Returns immutable updated overrides (no mutation).
 *
 * @param world - Full pipeline world state
 * @param planId - Maintenance plan id
 * @param taskId - Task id within the plan
 * @param now - Current date as ISO string (YYYY-MM-DD)
 * @param overrides - Current session overrides
 */
export function applyTaskCompletion(
  world: PipelineWorld,
  planId: string,
  taskId: string,
  now: string,
  overrides: MaintenanceOverrides,
): MaintenanceOverrides {
  // Find the task
  const plan = world.maintenancePlans.find((p) => p.id === planId);
  if (!plan) return overrides;

  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) return overrides;

  const key = taskKey(planId, taskId);

  let nextDue: string;
  if (task.frequency === MaintenanceFrequency.BY_HOURS) {
    // Spec wins: BY_HOURS tasks keep existing nextDueDate unchanged (SR-204 §14).
    // Contract: if task.nextDueDate is "" (no seed date), the override stores ""
    // unchanged. Callers MUST NOT invent a date; the UI renders no calendar badge.
    nextDue = task.nextDueDate;
  } else {
    // Calendar tasks: recalculate from now
    nextDue = nextDueDateByCalendar(now, task.frequency);
  }

  return {
    ...overrides,
    completedTasks: {
      ...overrides.completedTasks,
      [key]: {
        completedAt: now,
        nextDueDate: nextDue,
      },
    },
  };
}

// Re-export TaskStatus for consumers
export { TaskStatus };
export type { TaskStatusType as TaskStatusValue };
// Re-export scheduling helpers used by store
export { taskStatus, maintenancePriorityScore, nextDueDateByCalendar };
