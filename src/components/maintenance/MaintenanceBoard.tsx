"use client";

/**
 * MaintenanceBoard — intersection-filtered DataTable of maintenance tasks (SR-208).
 *
 * Filters: tree selection (from selectionStore) AND status chips (OVERDUE/UPCOMING/OK)
 *          AND free-text search (equipmentTag / equipmentName, debounced ≥150ms).
 * Sortable columns: taskStatus, criticality, operatingHours.
 * Default sort: priorityScore descending.
 * Row highlight: OVERDUE → red, UPCOMING → amber.
 * Reads overrides from maintenanceStore; reads selection from selectionStore.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { PipelineWorld } from "@/lib/domain";
import {
  deriveMaintenanceBoardRows,
  filterMaintenanceBoardRows,
  TaskStatus,
} from "@/lib/maintenance/selectors";
import type { MaintenanceBoardRow } from "@/lib/maintenance/selectors";
import { useMaintenanceStore } from "@/store/maintenanceStore";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import { DataTable } from "@/components/ui/DataTable";
import type { DataTableColumn, RowVariant } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Diaria",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  BIANNUAL: "Semestral",
  ANNUAL: "Anual",
  BY_HOURS: "Por horas",
};

const CRITICALITY_LABELS: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

const COLUMNS: DataTableColumn<MaintenanceBoardRow>[] = [
  {
    key: "equipmentTag",
    label: "Equipo",
    render: (row) => (
      <span className="font-mono tabular-nums text-[12px]">
        <span className="text-ink-primary">{row.equipmentTag}</span>
        <span className="text-ink-muted"> — {row.equipmentName}</span>
      </span>
    ),
  },
  {
    key: "stationName",
    label: "Estación",
    render: (row) => (
      <span className="text-[12px] text-ink-secondary">{row.stationName}</span>
    ),
  },
  {
    key: "taskName",
    label: "Tarea",
    render: (row) => (
      <span className="text-[12px] text-ink-primary">{row.taskName}</span>
    ),
  },
  {
    key: "taskStatus",
    label: "Estado",
    sortable: true,
    render: (row) => {
      const variant =
        row.taskStatus === TaskStatus.OVERDUE
          ? "overdue"
          : row.taskStatus === TaskStatus.UPCOMING
            ? "upcoming"
            : "ok";
      return <StatusBadge variant={variant} />;
    },
  },
  {
    key: "frequency",
    label: "Frecuencia",
    render: (row) => (
      <span className="text-[11px] text-ink-secondary">
        {FREQUENCY_LABELS[row.frequency as string] ?? row.frequency}
      </span>
    ),
  },
  {
    key: "criticality",
    label: "Criticidad",
    sortable: true,
    render: (row) => (
      <span className="text-[11px] text-ink-secondary">
        {CRITICALITY_LABELS[row.criticality as string] ?? row.criticality}
      </span>
    ),
  },
  {
    key: "operatingHours",
    label: "Horas Op.",
    sortable: true,
    render: (row) => (
      <span
        className="font-mono text-[12px] tabular-nums text-ink-primary"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {row.operatingHours.toLocaleString("es-AR")}
      </span>
    ),
  },
  {
    key: "nextDueDate",
    label: "Próxima Fecha",
    render: (row) => (
      <span
        className="font-mono text-[11px] tabular-nums text-ink-secondary"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {row.nextDueDate || "—"}
      </span>
    ),
  },
];

// ---------------------------------------------------------------------------
// Status chip type
// ---------------------------------------------------------------------------

const STATUS_CHIPS: Array<{
  status: string;
  label: string;
  variant: "overdue" | "upcoming" | "ok";
}> = [
  { status: TaskStatus.OVERDUE, label: "Vencida", variant: "overdue" },
  { status: TaskStatus.UPCOMING, label: "Próxima", variant: "upcoming" },
  { status: TaskStatus.OK, label: "OK", variant: "ok" },
];

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortKey = keyof MaintenanceBoardRow;
type SortDir = "asc" | "desc";

const CRITICALITY_ORDER: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
const STATUS_ORDER: Record<string, number> = {
  OVERDUE: 2,
  UPCOMING: 1,
  OK: 0,
};

function sortRows(
  rows: MaintenanceBoardRow[],
  key: SortKey | null,
  dir: SortDir,
): MaintenanceBoardRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (key === "taskStatus") {
      cmp = (STATUS_ORDER[a.taskStatus] ?? 0) - (STATUS_ORDER[b.taskStatus] ?? 0);
    } else if (key === "criticality") {
      cmp =
        (CRITICALITY_ORDER[a.criticality] ?? 0) -
        (CRITICALITY_ORDER[b.criticality] ?? 0);
    } else if (key === "operatingHours") {
      cmp = a.operatingHours - b.operatingHours;
    } else {
      // Default: priorityScore descending
      cmp = b.priorityScore - a.priorityScore;
      return cmp; // default is always desc
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MaintenanceBoardProps {
  world: PipelineWorld;
  now: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Maintenance task board with intersection filtering (SR-208).
 *
 * Filter chain: selection (tree) AND status chips AND text search — ANDed.
 * Category-level selection populates selectionEquipmentType (SR-204 §11 pin).
 */
export function MaintenanceBoard({ world, now }: MaintenanceBoardProps) {
  const overrides = useMaintenanceStore((s) => s.overrides);
  const activeBoardFilter = useMaintenanceStore((s) => s.activeBoardFilter);
  const setBoardFilter = useMaintenanceStore((s) => s.setBoardFilter);

  const selectedEntityId = useSelectionStore((s) => s.selectedEntityId);
  const selectedEntityType = useSelectionStore((s) => s.selectedEntityType);

  // Local state: status chip filter (multi-select)
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);

  // Local state: text search (raw input value)
  const [searchInput, setSearchInput] = useState("");

  // Debounced search text ref + state
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 150);
  }

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleStatusChip(status: string) {
    setActiveStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  // Derive rows (memoized)
  const allRows = useMemo(
    () => deriveMaintenanceBoardRows(world, now, overrides),
    [world, now, overrides],
  );

  // Compose the effective filter by merging selectionStore + store filter + local state
  const effectiveFilter = useMemo(() => {
    // Start from the store filter (handles tree clicks directly)
    // If selectionStore has an EQUIPMENT selection, override the selection part
    const selectionFilter =
      selectedEntityId && selectedEntityType === EntityType.EQUIPMENT
        ? {
            selectionId: selectedEntityId,
            selectionLevel: "equipment" as const,
            stationId: activeBoardFilter.stationId,
            selectionEquipmentType: activeBoardFilter.selectionEquipmentType,
          }
        : selectedEntityId && selectedEntityType === EntityType.STATION
          ? {
              selectionId: selectedEntityId,
              selectionLevel: "station" as const,
              stationId: selectedEntityId,
              selectionEquipmentType: undefined,
            }
          : {
              selectionId: activeBoardFilter.selectionId,
              selectionLevel: activeBoardFilter.selectionLevel,
              stationId: activeBoardFilter.stationId,
              selectionEquipmentType: activeBoardFilter.selectionEquipmentType,
            };

    return {
      ...selectionFilter,
      statusFilter: activeStatuses.length > 0 ? activeStatuses : undefined,
      searchText: debouncedSearch.trim() || undefined,
    };
  }, [
    selectedEntityId,
    selectedEntityType,
    activeBoardFilter,
    activeStatuses,
    debouncedSearch,
  ]);

  // Filter + sort
  const filteredRows = useMemo(
    () => filterMaintenanceBoardRows(allRows, effectiveFilter as Parameters<typeof filterMaintenanceBoardRows>[1]),
    [allRows, effectiveFilter],
  );

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );

  // Row variant callback
  const rowVariant = useCallback((row: MaintenanceBoardRow): RowVariant => {
    if (row.taskStatus === TaskStatus.OVERDUE) return "overdue";
    if (row.taskStatus === TaskStatus.UPCOMING) return "upcoming";
    return "default";
  }, []);

  const resetFilter = useCallback(() => {
    setBoardFilter({});
    setActiveStatuses([]);
    setSearchInput("");
    setDebouncedSearch("");
  }, [setBoardFilter]);

  const hasActiveFilter =
    activeBoardFilter.selectionId ||
    activeStatuses.length > 0 ||
    debouncedSearch.trim();

  return (
    <div className="flex flex-col gap-0">
      {/* Filter bar */}
      <div className="flex flex-col gap-2 border-b border-border-subtle bg-surface-raised px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status chips */}
          {STATUS_CHIPS.map(({ status, label, variant }) => (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatusChip(status)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1",
                "text-[10px] font-medium uppercase tracking-[0.1em] transition-opacity",
                "border",
                activeStatuses.includes(status)
                  ? "opacity-100 border-transparent"
                  : "opacity-50 border-border-mid bg-transparent",
              )}
              aria-pressed={activeStatuses.includes(status)}
            >
              <StatusBadge variant={variant} label={label} />
            </button>
          ))}

          {/* Text search */}
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar equipo…"
            className={cn(
              "ml-auto w-48 border border-border-mid bg-surface-base px-3 py-1.5",
              "text-[12px] text-ink-primary placeholder:text-ink-muted",
              "focus:border-accent focus:outline-none",
            )}
          />

          {/* Reset filter */}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={resetFilter}
              className="text-[10px] uppercase tracking-[0.1em] text-ink-muted hover:text-ink-primary"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Data table */}
      <DataTable<MaintenanceBoardRow>
        columns={COLUMNS}
        rows={sortedRows}
        sortKey={sortKey ?? undefined}
        sortDir={sortDir}
        onSort={handleSort}
        rowVariant={rowVariant}
        getRowKey={(row) => `${row.planId}:${row.taskId}`}
        emptyLabel="Sin tareas para los filtros seleccionados"
        caption="Tablero de tareas de mantenimiento"
        className="flex-1"
      />
    </div>
  );
}
