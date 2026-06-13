"use client";

/**
 * ReadingsTable — DataTable<ReadingTableRow> for cathodic readings. SR-308.
 *
 * Columns: km, Potential (V), Level (StatusBadge), Trend (Sparkline), Direction (TrendFlag text).
 * Row click → selectEntity(row.pointKey, EntityType.CATHODIC_POINT).
 * Active row highlight: left accent border using --status-flow token.
 * Default sort: km ascending.
 */

import { useState, useCallback, useMemo } from "react";
import { DataTable, SORT_DIR } from "@/components/ui/DataTable";
import type { DataTableColumn } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge";
import { Sparkline } from "@/components/integrity/Sparkline";
import { buildReadingTableRows, TrendFlag } from "@/lib/integrity/selectors";
import type { ReadingTableRow } from "@/lib/integrity/selectors";
import {
  useSelectionStore,
  useSelection,
  EntityType,
} from "@/store/selectionStore";
import { AlertLevel } from "@/lib/domain/types";
import type { PipelineWorld } from "@/lib/domain";

// ============================================================================
// Props
// ============================================================================

export interface ReadingsTableProps {
  world: PipelineWorld;
}

// ============================================================================
// Helpers
// ============================================================================

/** Map AlertLevel to StatusBadge variant. */
const LEVEL_BADGE: Record<AlertLevel, StatusBadgeVariant> = {
  [AlertLevel.OK]: "ok",
  [AlertLevel.WARNING]: "warning",
  [AlertLevel.CRITICAL]: "critical",
};

// ============================================================================
// Column definitions (typed to ReadingTableRow)
// ============================================================================

const COLUMNS: DataTableColumn<ReadingTableRow>[] = [
  {
    key: "km",
    label: "km",
    sortable: true,
    render: (row) => (
      <span
        className="font-mono tabular-nums text-sm text-ink-primary"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {row.km.toFixed(1)}
      </span>
    ),
  },
  {
    key: "latestPotentialV",
    label: "Potencial (V)",
    sortable: true,
    render: (row) => (
      <span
        className="font-mono tabular-nums text-sm text-ink-primary"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {row.latestPotentialV.toFixed(3)}
      </span>
    ),
  },
  {
    key: "level",
    label: "Nivel",
    sortable: false,
    render: (row) => (
      <StatusBadge variant={LEVEL_BADGE[row.level as AlertLevel] ?? "warning"} />
    ),
  },
  {
    key: "sparkleSeries",
    label: "Tendencia",
    sortable: false,
    render: (row) => (
      <Sparkline
        series={Array.from(row.sparkleSeries)}
        degrading={row.trend === TrendFlag.DEGRADING}
        label={`Tendencia del punto ${row.pointKey}`}
      />
    ),
  },
  {
    key: "trend",
    label: "Dirección",
    sortable: false,
    render: (row) => (
      <span
        className="font-mono text-sm text-ink-secondary"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {row.trend}
      </span>
    ),
  },
];

// ============================================================================
// Component
// ============================================================================

type SortKey = keyof ReadingTableRow;

/**
 * Sortable table of cathodic readings — one row per unique km:segmentId point.
 * Row click selects the point via selectionStore (CATHODIC_POINT entity type).
 * Active row receives a left accent border (--status-flow) via DataTable's
 * isRowSelected + inline style override (no additional CSS needed).
 */
export function ReadingsTable({ world }: ReadingsTableProps) {
  // Memoize expensive O(n log n) selector — only re-runs when world changes,
  // not on every sort-state update (column header clicks).
  const rows = useMemo(() => buildReadingTableRows(world), [world]);
  const selectEntity = useSelectionStore((s) => s.selectEntity);
  const { selectedEntityId, selectedEntityType } = useSelection();

  const [sortKey, setSortKey] = useState<SortKey>("km");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(SORT_DIR.ASC);

  const handleSort = useCallback(
    (key: keyof ReadingTableRow) => {
      if (key === sortKey) {
        setSortDir((d) => (d === SORT_DIR.ASC ? SORT_DIR.DESC : SORT_DIR.ASC));
      } else {
        setSortKey(key);
        setSortDir(SORT_DIR.ASC);
      }
    },
    [sortKey],
  );

  const handleRowClick = useCallback(
    (row: ReadingTableRow) => {
      selectEntity(row.pointKey, EntityType.CATHODIC_POINT);
    },
    [selectEntity],
  );

  const isRowSelected = useCallback(
    (row: ReadingTableRow) =>
      selectedEntityId === row.pointKey &&
      selectedEntityType === EntityType.CATHODIC_POINT,
    [selectedEntityId, selectedEntityType],
  );

  // Sort rows client-side
  const sortedRows = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const dir = sortDir === SORT_DIR.ASC ? 1 : -1;
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * dir;
    }
    return String(av).localeCompare(String(bv)) * dir;
  });

  return (
    <section className="flex flex-col border border-border-mid bg-surface-raised">
      <header className="border-b border-border-mid px-4 py-3">
        <h2
          className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Lecturas Catódicas
        </h2>
      </header>

      <DataTable<ReadingTableRow>
        columns={COLUMNS}
        rows={sortedRows}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={handleRowClick}
        isRowSelected={isRowSelected}
        getRowKey={(row) => row.pointKey}
        emptyLabel="Sin lecturas catódicas"
        caption="Cathodic protection readings table"
      />
    </section>
  );
}
