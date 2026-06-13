import { describe, it, expect } from "vitest";
import {
  nextDueDateByCalendar,
  nextDueHoursByUsage,
  taskStatus,
  maintenancePriorityScore,
} from "./scheduling";
import { MaintenanceFrequency, Criticality, MaintenanceType, EquipmentType } from "@/lib/domain";
import type { MaintenanceTask, Equipment } from "@/lib/domain";

function makeTask(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    id: "task-1",
    planId: "plan-1",
    name: "Test task",
    type: MaintenanceType.PREVENTIVE,
    frequency: MaintenanceFrequency.MONTHLY,
    nextDueDate: "2026-07-01",
    ...overrides,
  };
}

function makeEquipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "equip-1",
    tag: "J-001",
    name: "Pump A",
    type: EquipmentType.PUMP,
    criticality: Criticality.MEDIUM,
    isOperational: true,
    stationId: "station-1",
    operatingHours: 1000,
    ...overrides,
  };
}

describe("Maintenance scheduling", () => {
  describe("nextDueDateByCalendar", () => {
    // S-008-A: MONTHLY adds one month
    it("adds 1 month for MONTHLY frequency", () => {
      expect(nextDueDateByCalendar("2026-01-15", MaintenanceFrequency.MONTHLY)).toBe("2026-02-15");
    });

    it("adds 1 day for DAILY frequency", () => {
      expect(nextDueDateByCalendar("2026-06-10", MaintenanceFrequency.DAILY)).toBe("2026-06-11");
    });

    it("adds 7 days for WEEKLY frequency", () => {
      expect(nextDueDateByCalendar("2026-06-01", MaintenanceFrequency.WEEKLY)).toBe("2026-06-08");
    });

    it("adds 3 months for QUARTERLY frequency", () => {
      expect(nextDueDateByCalendar("2026-01-15", MaintenanceFrequency.QUARTERLY)).toBe(
        "2026-04-15",
      );
    });

    it("adds 6 months for BIANNUAL frequency", () => {
      expect(nextDueDateByCalendar("2026-01-15", MaintenanceFrequency.BIANNUAL)).toBe("2026-07-15");
    });

    it("adds 12 months for ANNUAL frequency", () => {
      expect(nextDueDateByCalendar("2026-01-15", MaintenanceFrequency.ANNUAL)).toBe("2027-01-15");
    });

    it("handles month-end rollover for MONTHLY (Jan 31 → Feb 28)", () => {
      const result = nextDueDateByCalendar("2026-01-31", MaintenanceFrequency.MONTHLY);
      // JS Date clamping: Jan 31 + 1 month = Feb 28 (2026 is not a leap year)
      expect(result).toBe("2026-02-28");
    });

    it("handles year boundary for MONTHLY (Dec 15 → Jan 15)", () => {
      expect(nextDueDateByCalendar("2025-12-15", MaintenanceFrequency.MONTHLY)).toBe("2026-01-15");
    });
  });

  describe("nextDueHoursByUsage", () => {
    it("returns sum of last intervention hours and interval", () => {
      expect(nextDueHoursByUsage(500, 2000)).toBe(2500);
    });

    it("returns correct value starting from 0 hours", () => {
      expect(nextDueHoursByUsage(0, 1500)).toBe(1500);
    });

    it("handles non-standard interval", () => {
      expect(nextDueHoursByUsage(3000, 750)).toBe(3750);
    });
  });

  describe("taskStatus", () => {
    // S-008-B: overdue task
    it("returns OVERDUE when nextDueDate is in the past", () => {
      const task = makeTask({ nextDueDate: "2025-12-01" });
      expect(taskStatus(task, "2026-06-12")).toBe("OVERDUE");
    });

    // S-008-C: upcoming task due in 5 days
    it("returns UPCOMING for task due in 5 days", () => {
      const task = makeTask({ nextDueDate: "2026-06-17" });
      expect(taskStatus(task, "2026-06-12")).toBe("UPCOMING");
    });

    it("returns UPCOMING for task due in exactly 7 days", () => {
      const task = makeTask({ nextDueDate: "2026-06-19" });
      expect(taskStatus(task, "2026-06-12")).toBe("UPCOMING");
    });

    it("returns OK for task due in 30 days", () => {
      const task = makeTask({ nextDueDate: "2026-07-12" });
      expect(taskStatus(task, "2026-06-12")).toBe("OK");
    });

    it("returns OVERDUE for task due today", () => {
      const task = makeTask({ nextDueDate: "2026-06-12" });
      expect(taskStatus(task, "2026-06-12")).toBe("OVERDUE");
    });

    it("returns UPCOMING for BY_HOURS task with ≤10% remaining interval", () => {
      const task = makeTask({
        frequency: MaintenanceFrequency.BY_HOURS,
        nextDueAtHours: 2000,
        intervalHours: 2000,
        nextDueDate: "2999-12-31", // far future calendar date
      });
      // current hours = 1850 → remaining = 150 → 150/2000 = 7.5% ≤ 10%
      expect(taskStatus(task, "2026-06-12", 1850)).toBe("UPCOMING");
    });

    it("returns OVERDUE for BY_HOURS task with negative remaining hours", () => {
      const task = makeTask({
        frequency: MaintenanceFrequency.BY_HOURS,
        nextDueAtHours: 2000,
        intervalHours: 2000,
        nextDueDate: "2999-12-31",
      });
      // current hours = 2100 → remaining = -100
      expect(taskStatus(task, "2026-06-12", 2100)).toBe("OVERDUE");
    });
  });

  describe("maintenancePriorityScore", () => {
    // S-008-D: CRITICAL equipment gets higher score
    it("CRITICAL equipment scores higher than LOW criticality", () => {
      const task = makeTask({ nextDueDate: "2025-01-01" }); // overdue
      const criticalEquip = makeEquipment({ criticality: Criticality.CRITICAL });
      const lowEquip = makeEquipment({ criticality: Criticality.LOW });
      const now = "2026-06-12";

      const criticalScore = maintenancePriorityScore(task, criticalEquip, now);
      const lowScore = maintenancePriorityScore(task, lowEquip, now);

      expect(criticalScore).toBeGreaterThan(lowScore);
    });

    it("overdue task scores higher than OK task for same equipment", () => {
      const overdueTask = makeTask({ nextDueDate: "2025-01-01" });
      const okTask = makeTask({ nextDueDate: "2026-12-01" });
      const equipment = makeEquipment({ criticality: Criticality.MEDIUM });
      const now = "2026-06-12";

      const overdueScore = maintenancePriorityScore(overdueTask, equipment, now);
      const okScore = maintenancePriorityScore(okTask, equipment, now);

      expect(overdueScore).toBeGreaterThan(okScore);
    });

    it("returns a positive number for any task", () => {
      const task = makeTask({ nextDueDate: "2026-12-01" });
      const equipment = makeEquipment();
      expect(maintenancePriorityScore(task, equipment, "2026-06-12")).toBeGreaterThan(0);
    });

    it("HIGH criticality scores between LOW and CRITICAL", () => {
      const task = makeTask({ nextDueDate: "2025-01-01" });
      const now = "2026-06-12";
      const criticalScore = maintenancePriorityScore(
        task,
        makeEquipment({ criticality: Criticality.CRITICAL }),
        now,
      );
      const highScore = maintenancePriorityScore(
        task,
        makeEquipment({ criticality: Criticality.HIGH }),
        now,
      );
      const lowScore = maintenancePriorityScore(
        task,
        makeEquipment({ criticality: Criticality.LOW }),
        now,
      );

      expect(criticalScore).toBeGreaterThan(highScore);
      expect(highScore).toBeGreaterThan(lowScore);
    });

    // Score formula anchor: score = 0.6 × urgency + 0.4 × criticalityLevel
    // OVERDUE urgency=3, CRITICAL criticalityLevel=4 → 0.6×3 + 0.4×4 = 1.8 + 1.6 = 3.4
    it("numeric anchor: OVERDUE + CRITICAL equipment = score 3.4", () => {
      const overdueTask = makeTask({ nextDueDate: "2025-01-01" });
      const criticalEquip = makeEquipment({ criticality: Criticality.CRITICAL });
      expect(maintenancePriorityScore(overdueTask, criticalEquip, "2026-06-12")).toBeCloseTo(3.4, 5);
    });

    // OK urgency=1, LOW criticalityLevel=1 → 0.6×1 + 0.4×1 = 0.6 + 0.4 = 1.0
    it("numeric anchor: OK + LOW equipment = score 1.0", () => {
      const okTask = makeTask({ nextDueDate: "2026-12-01" });
      const lowEquip = makeEquipment({ criticality: Criticality.LOW });
      expect(maintenancePriorityScore(okTask, lowEquip, "2026-06-12")).toBeCloseTo(1.0, 5);
    });

    // Sorting by score is deterministic: same inputs always yield same result
    it("sort by priority score is deterministic (same inputs → same score)", () => {
      const task = makeTask({ nextDueDate: "2025-06-01" }); // OVERDUE
      const equip = makeEquipment({ criticality: Criticality.HIGH });
      const now = "2026-06-12";
      const s1 = maintenancePriorityScore(task, equip, now);
      const s2 = maintenancePriorityScore(task, equip, now);
      expect(s1).toBe(s2);
    });
  });

  describe("nextDueDateByCalendar error path", () => {
    // BY_HOURS is not a calendar frequency — must throw
    it("throws when called with BY_HOURS frequency", () => {
      expect(() =>
        nextDueDateByCalendar("2026-06-12", MaintenanceFrequency.BY_HOURS),
      ).toThrow();
    });
  });

  describe("taskStatus — BY_HOURS edge cases", () => {
    // BY_HOURS task at exactly 10% remaining → UPCOMING (boundary inclusive)
    it("returns UPCOMING for BY_HOURS task with exactly 10% remaining interval", () => {
      const task = makeTask({
        frequency: MaintenanceFrequency.BY_HOURS,
        nextDueAtHours: 2000,
        intervalHours: 2000,
        nextDueDate: "2999-12-31",
      });
      // remaining = 2000 - 1800 = 200; 200/2000 = 10% — exactly at threshold
      expect(taskStatus(task, "2026-06-12", 1800)).toBe("UPCOMING");
    });

    // BY_HOURS task just above 10% → OK
    it("returns OK for BY_HOURS task with slightly more than 10% remaining", () => {
      const task = makeTask({
        frequency: MaintenanceFrequency.BY_HOURS,
        nextDueAtHours: 2000,
        intervalHours: 2000,
        nextDueDate: "2999-12-31",
      });
      // remaining = 2000 - 1799 = 201; 201/2000 = 10.05% > 10%
      expect(taskStatus(task, "2026-06-12", 1799)).toBe("OK");
    });

    // BY_HOURS task with no currentHours falls back to calendar check
    it("falls back to calendar check when currentHours is not provided for BY_HOURS task", () => {
      const upcomingByCalendar = makeTask({
        frequency: MaintenanceFrequency.BY_HOURS,
        nextDueAtHours: 2000,
        intervalHours: 2000,
        nextDueDate: "2026-06-15", // 3 days away → UPCOMING by calendar
      });
      // No currentHours argument — BY_HOURS branch skipped entirely
      expect(taskStatus(upcomingByCalendar, "2026-06-12")).toBe("UPCOMING");
    });

    it("uses calendar OVERDUE when no currentHours and nextDueDate is past", () => {
      const task = makeTask({
        frequency: MaintenanceFrequency.BY_HOURS,
        nextDueAtHours: 2000,
        intervalHours: 2000,
        nextDueDate: "2026-01-01", // past → OVERDUE by calendar
      });
      expect(taskStatus(task, "2026-06-12")).toBe("OVERDUE");
    });
  });
});
