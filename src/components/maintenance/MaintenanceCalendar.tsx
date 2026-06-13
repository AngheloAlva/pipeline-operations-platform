"use client";

/**
 * MaintenanceCalendar — in-house month grid calendar (SR-209, design ADR-5).
 *
 * 7-column grid (Sun–Sat). No external calendar library.
 * Month navigation via maintenanceStore.prevMonth / nextMonth.
 * Tasks from bucketTasksByMonth, placed on day cells.
 * Clicking a task dot calls selectEntity(equipmentId, EQUIPMENT).
 * No border-radius on grid cells (flat instrument aesthetic).
 */

import { useMemo } from "react";
import type { PipelineWorld } from "@/lib/domain";
import { bucketTasksByMonth, TaskStatus } from "@/lib/maintenance/selectors";
import type { CalendarBucket } from "@/lib/maintenance/selectors";
import { useMaintenanceStore } from "@/store/maintenanceStore";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import { MaintenanceFrequency } from "@/lib/domain";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Month grid utilities
// ---------------------------------------------------------------------------

const MONTH_NAMES_ES: string[] = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface DayCell {
  /** Day of month, or null for padding cells */
  day: number | null;
}

/**
 * Build a 7-column month grid (Sunday–Saturday).
 * Returns an array of DayCell of length = Math.ceil(totalCells / 7) * 7.
 */
function buildMonthGrid(year: number, month: number): DayCell[] {
  // month is 1-based
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun, 6=Sat

  const cells: DayCell[] = [];

  // Leading empty cells
  for (let i = 0; i < startDow; i++) cells.push({ day: null });

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  // Trailing empty cells to complete the last row
  while (cells.length % 7 !== 0) cells.push({ day: null });

  return cells;
}

// ---------------------------------------------------------------------------
// Task dot visual
// ---------------------------------------------------------------------------

interface TaskDotProps {
  bucket: CalendarBucket;
  onClickTask: (bucket: CalendarBucket) => void;
}

function TaskDot({ bucket, onClickTask }: TaskDotProps) {
  // Color resolution (SR-209 §5):
  // OVERDUE → red (regardless of frequency)
  // BY_HOURS → blue (--telemetry-blue / --status-flow)
  // Calendar frequency → green (--status-ok / --phosphor)
  // isCompleted → muted with strikethrough

  let dotClass: string;
  let title: string;

  if (bucket.isCompleted) {
    dotClass = "bg-ink-muted opacity-50 line-through";
    title = `${bucket.taskName} (completada)`;
  } else if (bucket.taskStatus === TaskStatus.OVERDUE) {
    dotClass = "bg-status-critical";
    title = `${bucket.taskName} — VENCIDA`;
  } else if (bucket.frequency === MaintenanceFrequency.BY_HOURS) {
    dotClass = "bg-status-flow";
    title = `${bucket.taskName} — Por horas`;
  } else {
    // Calendar-frequency task (PREVENTIVE / other)
    dotClass = "bg-status-ok";
    title = `${bucket.taskName} — ${bucket.taskStatus === TaskStatus.UPCOMING ? "Próxima" : "OK"}`;
  }

  const canClick = !!bucket.equipmentId;

  return (
    <button
      type="button"
      onClick={() => canClick && onClickTask(bucket)}
      disabled={!canClick}
      title={title}
      className={cn(
        "flex w-full items-center gap-1 px-0.5 py-0.5 text-left",
        "text-[11px] leading-tight text-ink-primary",
        canClick && "cursor-pointer hover:bg-surface-interactive",
        !canClick && "cursor-default",
      )}
    >
      <span
        className={cn("inline-block h-2 w-2 flex-shrink-0 rounded-full", dotClass)}
        aria-hidden="true"
      />
      <span className={cn("truncate", bucket.isCompleted && "line-through text-ink-muted")}>
        {bucket.taskName}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MaintenanceCalendarProps {
  world: PipelineWorld;
  now: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * In-house month grid calendar.
 * Month navigation via maintenanceStore (prevMonth / nextMonth).
 * Tasks placed from bucketTasksByMonth.
 * Clicking a task dot selects the equipment in selectionStore.
 */
export function MaintenanceCalendar({ world, now }: MaintenanceCalendarProps) {
  const calendarYear = useMaintenanceStore((s) => s.calendarYear);
  const calendarMonth = useMaintenanceStore((s) => s.calendarMonth);
  const prevMonth = useMaintenanceStore((s) => s.prevMonth);
  const nextMonth = useMaintenanceStore((s) => s.nextMonth);
  const overrides = useMaintenanceStore((s) => s.overrides);

  const selectEntity = useSelectionStore((s) => s.selectEntity);

  // Build month grid cells
  const gridCells = useMemo(
    () => buildMonthGrid(calendarYear, calendarMonth),
    [calendarYear, calendarMonth],
  );

  // Bucket tasks for the current month
  const buckets = useMemo(
    () => bucketTasksByMonth(world, calendarYear, calendarMonth, overrides, now),
    [world, calendarYear, calendarMonth, overrides, now],
  );

  // Index buckets by day for quick lookup
  const bucketsByDay = useMemo(() => {
    const map = new Map<number, CalendarBucket[]>();
    for (const b of buckets) {
      if (!map.has(b.day)) map.set(b.day, []);
      map.get(b.day)!.push(b);
    }
    return map;
  }, [buckets]);

  function handleTaskClick(bucket: CalendarBucket) {
    if (bucket.equipmentId) {
      selectEntity(bucket.equipmentId, EntityType.EQUIPMENT);
    }
  }

  const monthLabel = `${MONTH_NAMES_ES[calendarMonth - 1]} ${calendarYear}`;

  // Split cells into weeks
  const weeks: DayCell[][] = [];
  for (let i = 0; i < gridCells.length; i += 7) {
    weeks.push(gridCells.slice(i, i + 7));
  }

  return (
    <div className="flex flex-col">
      {/* Month navigation header */}
      <div className="flex items-center justify-between border-b border-border-mid bg-surface-raised px-4 py-2">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Mes anterior"
          className="px-2 py-1 text-[13px] uppercase tracking-[0.1em] text-ink-secondary hover:text-ink-primary focus:outline-none"
        >
          ‹ Prev
        </button>

        <h2
          className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-primary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {monthLabel}
        </h2>

        <button
          type="button"
          onClick={nextMonth}
          aria-label="Mes siguiente"
          className="px-2 py-1 text-[13px] uppercase tracking-[0.1em] text-ink-secondary hover:text-ink-primary focus:outline-none"
        >
          Sig ›
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border-mid bg-surface-raised">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="px-1 py-1.5 text-center text-[12px] font-medium uppercase tracking-[0.12em] text-ink-muted"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid — no border-radius on cells (SR-209 §10) */}
      <div className="flex-1">
        {weeks.map((week, wIdx) => (
          <div key={wIdx} className="grid grid-cols-7 border-b border-border-subtle">
            {week.map((cell, cIdx) => {
              const dayBuckets = cell.day ? (bucketsByDay.get(cell.day) ?? []) : [];
              return (
                <div
                  key={cIdx}
                  className={cn(
                    "min-h-[72px] border-r border-border-subtle p-1 last:border-r-0",
                    cell.day === null && "bg-surface-base opacity-50",
                    cell.day !== null && "bg-surface-raised",
                  )}
                >
                  {cell.day !== null && (
                    <>
                      <div
                        className="mb-1 text-right text-[12px] font-medium tabular-nums text-ink-tertiary"
                        style={{ fontFamily: "var(--font-mono), monospace" }}
                      >
                        {cell.day}
                      </div>
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        {dayBuckets.map((b) => (
                          <TaskDot
                            key={`${b.planId}:${b.taskId}`}
                            bucket={b}
                            onClickTask={handleTaskClick}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
