/**
 * Maintenance scheduling functions.
 * Implements DOMAIN_RULES.md §4.
 * All functions are pure — no side effects, no external I/O.
 */

import {
  MaintenanceFrequency,
  Criticality,
  CRITICALITY_WEIGHTS,
} from "@/lib/domain";
import type { MaintenanceTask, Equipment } from "@/lib/domain";

/** Task status classification. */
export type TaskStatus = "OVERDUE" | "UPCOMING" | "OK";

/** Criticality numeric weights for priority scoring. §4.4 */
const CRITICALITY_LEVEL: Record<string, number> = {
  [Criticality.LOW]: 1,
  [Criticality.MEDIUM]: 2,
  [Criticality.HIGH]: 3,
  [Criticality.CRITICAL]: 4,
};

/** Urgency weights mapped to task status. */
const URGENCY_WEIGHT: Record<TaskStatus, number> = {
  OVERDUE: 3,
  UPCOMING: 2,
  OK: 1,
};

/** Days to add per frequency for calendar-based scheduling. §4.1 */
const CALENDAR_INTERVAL_DAYS: Partial<Record<string, number>> = {
  [MaintenanceFrequency.DAILY]: 1,
  [MaintenanceFrequency.WEEKLY]: 7,
};

/** Months to add per frequency for calendar-based scheduling. §4.1 */
const CALENDAR_INTERVAL_MONTHS: Partial<Record<string, number>> = {
  [MaintenanceFrequency.MONTHLY]: 1,
  [MaintenanceFrequency.QUARTERLY]: 3,
  [MaintenanceFrequency.BIANNUAL]: 6,
  [MaintenanceFrequency.ANNUAL]: 12,
};

/**
 * Parse an ISO date string and return a Date object treated as local midnight.
 * Using YYYY-MM-DD strings throughout to avoid timezone issues.
 */
function parseDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a Date to YYYY-MM-DD string.
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Compute the next due date for a calendar-based maintenance task.
 * Adds the appropriate interval to the last executed date. §4.1
 *
 * @param lastExecuted - ISO date string of last execution (YYYY-MM-DD)
 * @param frequency - Maintenance frequency (must not be BY_HOURS)
 * @returns ISO date string of the next due date
 */
export function nextDueDateByCalendar(
  lastExecuted: string,
  frequency: MaintenanceFrequency
): string {
  const date = parseDate(lastExecuted);

  const days = CALENDAR_INTERVAL_DAYS[frequency];
  if (days !== undefined) {
    date.setDate(date.getDate() + days);
    return formatDate(date);
  }

  const months = CALENDAR_INTERVAL_MONTHS[frequency];
  if (months !== undefined) {
    const originalDay = date.getDate();
    date.setDate(1); // avoid overflow before setting month
    date.setMonth(date.getMonth() + months);
    // Clamp to the last day of the target month
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDay));
    return formatDate(date);
  }

  // BY_HOURS: not a calendar-based frequency; caller should use nextDueHoursByUsage
  throw new Error(`nextDueDateByCalendar does not support frequency: ${frequency}`);
}

/**
 * Compute the next due operating hours for a usage-based maintenance task. §4.2
 *
 * @param lastInterventionHours - Operating hours at last intervention
 * @param intervalHours - Maintenance interval in hours
 * @returns Operating hour count at which maintenance is next due
 */
export function nextDueHoursByUsage(
  lastInterventionHours: number,
  intervalHours: number
): number {
  return lastInterventionHours + intervalHours;
}

/**
 * Determine the status of a maintenance task. §4.3
 *
 * For calendar-based tasks:
 * - OVERDUE: nextDueDate ≤ now
 * - UPCOMING: nextDueDate within 7 days
 * - OK: otherwise
 *
 * For BY_HOURS tasks (when currentHours is provided and task has nextDueAtHours):
 * - OVERDUE: remaining hours < 0
 * - UPCOMING: remaining hours ≤ 10% of intervalHours
 * - OK: otherwise
 * Calendar check is also applied for BY_HOURS tasks.
 *
 * @param task - The maintenance task
 * @param now - Current date as ISO string (YYYY-MM-DD)
 * @param currentHours - Current operating hours of the associated equipment (optional)
 */
export function taskStatus(
  task: MaintenanceTask,
  now: string,
  currentHours?: number
): TaskStatus {
  const nowDate = parseDate(now);
  const dueDate = parseDate(task.nextDueDate);

  // Calendar-based check (applies to all frequencies)
  const daysDiff = Math.floor(
    (dueDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff <= 0) {
    return "OVERDUE";
  }

  // BY_HOURS check when hours are available
  if (
    task.frequency === MaintenanceFrequency.BY_HOURS &&
    task.nextDueAtHours !== undefined &&
    task.intervalHours !== undefined &&
    currentHours !== undefined
  ) {
    const remainingHours = task.nextDueAtHours - currentHours;
    if (remainingHours < 0) {
      return "OVERDUE";
    }
    const threshold = task.intervalHours * 0.1; // 10% of interval
    if (remainingHours <= threshold) {
      return "UPCOMING";
    }
    return "OK";
  }

  if (daysDiff <= 7) {
    return "UPCOMING";
  }

  return "OK";
}

/**
 * Compute a priority score for a maintenance task. §4.4
 *
 * score = CRITICALITY_WEIGHTS.overdue × urgency + CRITICALITY_WEIGHTS.criticality × criticalityLevel
 *
 * @param task - The maintenance task
 * @param equipment - The equipment associated with the task
 * @param now - Current date as ISO string (YYYY-MM-DD)
 * @returns Numeric priority score (higher = higher priority)
 */
export function maintenancePriorityScore(
  task: MaintenanceTask,
  equipment: Equipment,
  now: string
): number {
  const status = taskStatus(task, now, equipment.operatingHours);
  const urgency = URGENCY_WEIGHT[status];
  const criticalityLevel = CRITICALITY_LEVEL[equipment.criticality] ?? 1;

  return (
    CRITICALITY_WEIGHTS.overdue * urgency +
    CRITICALITY_WEIGHTS.criticality * criticalityLevel
  );
}
