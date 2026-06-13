/**
 * DataTable — generic sortable table (SR-203).
 *
 * Generic DataTable<T extends object>. No "use client" — stateless/controlled.
 * Column definitions carry typed key and optional render function.
 * ARIA: role="table", role="columnheader", aria-sort, role="cell".
 * Row highlights via rowVariant (overdue → red left border, upcoming → amber).
 * No external library. No border-radius.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types (SR-203 §1)
// ---------------------------------------------------------------------------

/** Sort direction. */
export const SORT_DIR = {
  ASC: "asc",
  DESC: "desc",
} as const;
export type SortDir = (typeof SORT_DIR)[keyof typeof SORT_DIR];

/** Row highlight variant. */
export const ROW_VARIANT = {
  DEFAULT: "default",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
} as const;
export type RowVariant = (typeof ROW_VARIANT)[keyof typeof ROW_VARIANT];

/** Column definition — typed to the row type T. */
export interface DataTableColumn<T extends object> {
  /** Stable identifier used for sort state matching. */
  key: keyof T;
  /** Spanish column header label. */
  label: string;
  /** When true, the header renders a sort affordance button. */
  sortable?: boolean;
  /**
   * Custom cell renderer. Receives the full row.
   * When absent, the raw value of `row[key]` is rendered as a string.
   */
  render?: (row: T) => ReactNode;
}

/** DataTable props. All sort state is controlled by the parent. */
export interface DataTableProps<T extends object> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Controlled sort column key. */
  sortKey?: keyof T;
  /** Controlled sort direction. */
  sortDir?: SortDir;
  /**
   * Called when the user clicks a sortable column header.
   * Parent is responsible for toggling direction.
   */
  onSort?: (key: keyof T) => void;
  /** Per-row semantic highlight. */
  rowVariant?: (row: T) => RowVariant;
  /** Empty state label. Defaults to "Sin resultados". */
  emptyLabel?: string;
  /** Screen-reader caption for the table. */
  caption?: string;
  /** Additional className for the table wrapper. */
  className?: string;
  /** Optional row key extractor. When provided, used instead of rowIndex to key rows. */
  getRowKey?: (row: T) => string;
}

// ---------------------------------------------------------------------------
// Row variant styling
// SR-203 §3: overdue → alarm-red left border + dim red bg
//            upcoming → amber-safety left border + dim amber bg
//            default  → surface-raised background
// Uses inline style for the dynamic left border color so it always wins the
// cascade regardless of Tailwind output order (same pattern as KpiCard).
// ---------------------------------------------------------------------------

interface RowStyle {
  className: string;
  style?: React.CSSProperties;
}

function getRowStyle(variant: RowVariant): RowStyle {
  switch (variant) {
    case ROW_VARIANT.OVERDUE:
      return {
        className: "bg-status-critical-bg border-l-2",
        style: { borderLeftColor: "var(--alarm-red)" },
      };
    case ROW_VARIANT.UPCOMING:
      return {
        className: "bg-status-warning-bg border-l-2",
        style: { borderLeftColor: "var(--amber-safety)" },
      };
    default:
      return { className: "bg-surface-raised" };
  }
}

// ---------------------------------------------------------------------------
// Sort affordance icon
// ---------------------------------------------------------------------------

function SortIcon({ dir }: { dir?: SortDir }) {
  if (dir === SORT_DIR.ASC) {
    return <span aria-hidden="true" className="ml-1 text-[10px] text-accent">↑</span>;
  }
  if (dir === SORT_DIR.DESC) {
    return <span aria-hidden="true" className="ml-1 text-[10px] text-accent">↓</span>;
  }
  return <span aria-hidden="true" className="ml-1 text-[10px] text-ink-muted">↕</span>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Generic sortable data table.
 *
 * Controlled sort: parent owns sortKey + sortDir + onSort.
 * The component does NOT sort rows internally — the parent is responsible.
 *
 * @example
 *   <DataTable<MaintenanceBoardRow>
 *     columns={COLUMNS}
 *     rows={rows}
 *     sortKey="taskStatus"
 *     sortDir="asc"
 *     onSort={(key) => toggleSort(key)}
 *     rowVariant={(row) => row.taskStatus === "OVERDUE" ? "overdue" : "default"}
 *   />
 */
export function DataTable<T extends object>({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  rowVariant,
  emptyLabel = "Sin resultados",
  caption,
  className,
  getRowKey,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      {/* role="table" per SR-203 §5 */}
      <table
        role="table"
        className="w-full border-collapse text-sm"
      >
        {/* Screen-reader caption */}
        {caption && (
          <caption className="sr-only">{caption}</caption>
        )}

        {/* Header */}
        <thead>
          <tr role="row" className="border-b border-border-mid">
            {columns.map((col) => {
              const isSortedAsc = sortKey === col.key && sortDir === SORT_DIR.ASC;
              const isSortedDesc = sortKey === col.key && sortDir === SORT_DIR.DESC;
              const ariaSortValue: React.AriaAttributes["aria-sort"] =
                isSortedAsc
                  ? "ascending"
                  : isSortedDesc
                    ? "descending"
                    : col.sortable
                      ? "none"
                      : undefined;

              return (
                <th
                  key={String(col.key)}
                  role="columnheader"
                  scope="col"
                  aria-sort={ariaSortValue}
                  className={cn(
                    "px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-ink-secondary",
                    "border-b border-border-mid bg-surface-raised",
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(col.key)}
                      className="inline-flex items-center hover:text-ink-primary focus:outline-none"
                    >
                      {col.label}
                      <SortIcon
                        dir={sortKey === col.key ? sortDir : undefined}
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {rows.length === 0 ? (
            <tr role="row">
              <td
                role="cell"
                colSpan={columns.length}
                className="px-3 py-4 text-center text-sm text-ink-muted"
              >
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const variant = rowVariant ? rowVariant(row) : ROW_VARIANT.DEFAULT;
              const { className: rowClass, style: rowStyle } = getRowStyle(variant);
              const key: string | number = getRowKey ? getRowKey(row) : rowIndex;

              return (
                <tr
                  key={key}
                  role="row"
                  className={cn(
                    "border-b border-border-subtle transition-colors hover:bg-surface-interactive",
                    rowClass,
                  )}
                  style={rowStyle}
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      role="cell"
                      className="px-3 py-2.5 text-sm text-ink-primary"
                    >
                      {col.render
                        ? col.render(row)
                        : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
