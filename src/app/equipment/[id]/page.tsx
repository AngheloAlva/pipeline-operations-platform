"use client";

/**
 * Equipment aggregate detail page — /equipment/[id].
 *
 * F4-2: Hub-and-spoke equipment view. Composes three labeled sections:
 *   1. Maintenance — tasks and work orders keyed by equipmentId (F4-2-R4, R8)
 *   2. Station Flow — tanks at equipment.stationId with fill levels (F4-2-R4)
 *   3. Station Integrity — cathodic readings for stationId (F4-2-R5, R9)
 *
 * Uses useParams() (client, no await — Next.js 16 async-params rule is server-only).
 * Calls resolveEntity(world, id); notFound() if null or type !== EQUIPMENT (F4-2-R3).
 * Metadata lives in equipment/layout.tsx (page must be "use client").
 *
 * Station Integrity section renders an explicit empty-state when stationReadings
 * is empty — MUST NOT render computeIntegrityKpis zeros as if real data (F4-2-R5, ADR-3).
 * Cross-nav links (F4-2-R6, R7) are scoped to PR 3 (CrossNavLinks component).
 *
 * HOOKS RULE: ALL hook calls (useMemo, useParams, useWorldData, useMaintenanceStore)
 * are unconditional and appear BEFORE any conditional early return.
 */

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { CrossNavLinks } from "@/components/shared/CrossNavLinks";

import { useWorldData } from "@/hooks/useWorldData";
import { resolveEntity } from "@/lib/domain/resolveEntity";
import { EntityType } from "@/store/selectionStore";
import {
  deriveMaintenanceBoardRows,
  filterMaintenanceBoardRows,
} from "@/lib/maintenance/selectors";
import {
  computeIntegrityKpis,
  extractReadingSeriesForChart,
  buildReadingTableRowsFromReadings,
} from "@/lib/integrity/selectors";
import { useMaintenanceStore } from "@/store/maintenanceStore";

import { KpiCard } from "@/components/ui/KpiCard";
import { TankGauge } from "@/components/cockpit/TankGauge";

import type { ThresholdLine } from "@/components/charts/TimeSeriesChart";
import { CATHODIC_OK, CATHODIC_WARN } from "@/lib/domain/constants";
import { STATUS_OK, STATUS_WARNING } from "@/lib/charts/palette";
import { cn } from "@/lib/cn";

// CRITICAL: TimeSeriesChart uses Recharts ResponsiveContainer — import dynamically
// with ssr:false to avoid hydration mismatch (same pattern as ReadingDetail).
const TimeSeriesChart = dynamic(
  () =>
    import("@/components/charts/TimeSeriesChart").then(
      (m) => m.TimeSeriesChart,
    ),
  {
    ssr: false,
    loading: () => <div style={{ height: 200 }} className="w-full" aria-hidden="true" />,
  },
);

// ============================================================================
// Constants
// ============================================================================

const INTEGRITY_THRESHOLDS: ThresholdLine[] = [
  { value: CATHODIC_OK, label: `Protected (${CATHODIC_OK}V)`, color: STATUS_OK },
  { value: CATHODIC_WARN, label: `Marginal (${CATHODIC_WARN}V)`, color: STATUS_WARNING },
];

const TASK_STATUS_LABELS: Record<string, string> = {
  OVERDUE: "Overdue",
  UPCOMING: "Upcoming",
  OK: "OK",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  OVERDUE: "var(--alarm-red)",
  UPCOMING: "var(--amber-safety)",
  OK: "var(--status-ok)",
};

// ============================================================================
// Section wrapper — reusable labeled section card
// ============================================================================

function SectionPanel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border border-border-mid bg-surface-raised flex flex-col gap-4 p-5",
        className,
      )}
    >
      <div className="border-b border-border-subtle pb-3">
        <h2
          className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-secondary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-ink-muted"
            style={{ fontFamily: "var(--font-mono), monospace" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// ============================================================================
// Equipment identity header
// ============================================================================

function EquipmentHeader({ tag, name, type, criticality, stationName }: {
  tag: string;
  name: string;
  type: string;
  criticality: string;
  stationName: string;
}) {
  return (
    <div className="border-b border-border-subtle py-5">
      <div className="flex flex-col gap-1">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Equipment Detail
        </p>
        <h1
          className="text-[22px] font-medium tracking-tight text-ink-primary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {tag} — {name}
        </h1>
        <p className="text-[13px] text-ink-secondary">
          {type} &middot; {criticality} &middot; {stationName}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Page body
// ============================================================================

function EquipmentPageBody() {
  const { id } = useParams<{ id: string }>();
  const { world } = useWorldData();

  // Maintenance store overrides for deriveMaintenanceBoardRows
  const overrides = useMaintenanceStore((s) => s.overrides);
  const now = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ---------------------------------------------------------------------------
  // Resolve entity — null-safe: world may be null on first render (pre-hydration).
  // All hook calls MUST be unconditional and run before any conditional return.
  // ---------------------------------------------------------------------------
  const resolved = world ? resolveEntity(world, id) : null;

  // WARNING FIX: narrow stationId to string without ! assertion.
  // The guard checks type AND stationId presence so TS narrows correctly downstream.
  const shouldNotFound =
    world !== null &&
    (!resolved || resolved.type !== EntityType.EQUIPMENT || !resolved.stationId);

  const stationId: string =
    resolved?.type === EntityType.EQUIPMENT && resolved.stationId
      ? resolved.stationId
      : "";

  // ---------------------------------------------------------------------------
  // Section 1: Maintenance data (F4-2-R4, R8) — null-safe fallbacks
  // ---------------------------------------------------------------------------
  const allBoardRows = useMemo(
    () => (world ? deriveMaintenanceBoardRows(world, now, overrides) : []),
    [world, now, overrides],
  );

  const equipmentBoardRows = useMemo(
    () =>
      filterMaintenanceBoardRows(allBoardRows, {
        selectionId: id,
        selectionLevel: "equipment",
      }),
    [allBoardRows, id],
  );

  const equipmentWorkOrders = useMemo(
    () => (world ? world.workOrders.filter((wo) => wo.equipmentId === id) : []),
    [world, id],
  );

  // ---------------------------------------------------------------------------
  // Section 2: Station Flow — tanks at this station (F4-2-R4 section 2)
  // ---------------------------------------------------------------------------
  const stationTanks = useMemo(
    () => (world ? world.tanks.filter((t) => t.stationId === stationId) : []),
    [world, stationId],
  );

  // ---------------------------------------------------------------------------
  // Section 3: Station Integrity — cathodic readings for stationId (F4-2-R5, R9)
  // CRITICAL 2 FIX: use buildReadingTableRowsFromReadings(stationReadings) —
  // explicit, type-honest contract; no { ...world, cathodicReadings } spread.
  // ---------------------------------------------------------------------------
  const stationReadings = useMemo(
    () =>
      world && stationId
        ? world.cathodicReadings.filter((r) => r.stationId === stationId)
        : [],
    [world, stationId],
  );

  const integrityKpis = useMemo(
    () => computeIntegrityKpis(stationReadings),
    [stationReadings],
  );

  const integrityRows = useMemo(
    () => buildReadingTableRowsFromReadings(stationReadings),
    [stationReadings],
  );

  // NIT FIX: wrap firstRowKey in useMemo for style consistency with surrounding memos.
  const firstRowKey = useMemo(
    () => (integrityRows.length > 0 ? integrityRows[0].pointKey : null),
    [integrityRows],
  );

  const integrityChartSeries = useMemo(
    () => (firstRowKey ? extractReadingSeriesForChart(stationReadings, firstRowKey) : []),
    [stationReadings, firstRowKey],
  );

  const hasIntegrityReadings = stationReadings.length > 0;

  // ---------------------------------------------------------------------------
  // Conditional returns — ALL hooks have already run above this point.
  // ---------------------------------------------------------------------------

  // Loading guard — world is bundled seed, always available quickly
  if (!world) {
    return (
      <div className="flex items-center justify-center py-32">
        <span
          className="text-[13px] uppercase tracking-[0.12em] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Loading pipeline data…
        </span>
      </div>
    );
  }

  // F4-2-R3: entity must exist and be EQUIPMENT type with a stationId
  if (shouldNotFound) {
    notFound();
  }

  // At this point resolved is guaranteed non-null with stationId
  const equipment = world.equipment.find((e) => e.id === id)!;
  const station = world.stations.find((s) => s.id === stationId);
  const stationName = station?.name ?? stationId;

  return (
    <div className="mx-auto max-w-panel px-4 py-4 sm:px-6 flex flex-col gap-4">
      {/* Equipment identity header */}
      <EquipmentHeader
        tag={equipment.tag}
        name={equipment.name}
        type={equipment.type}
        criticality={equipment.criticality}
        stationName={stationName}
      />

      {/* F4-2-R6/R7, F4-3-R2, F4-3-S6: hub-and-spoke cross-module links.
          exclude=['equipment'] since we are already on the equipment page.
          resolved is non-null at runtime (notFound() above throws when null);
          CrossNavLinks also handles null defensively. */}
      <CrossNavLinks entity={resolved} exclude={["equipment"]} />

      {/* ================================================================
          Section 1: Maintenance (F4-2-R4, R8)
          ================================================================ */}
      <SectionPanel
        title="Maintenance"
        subtitle={`Equipment ${equipment.tag} · ${equipmentBoardRows.length} task(s) · ${equipmentWorkOrders.length} work order(s)`}
      >
        {/* Maintenance tasks table */}
        {equipmentBoardRows.length === 0 ? (
          <p
            className="text-[13px] text-ink-muted py-4 text-center"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            No maintenance tasks found for this equipment.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_120px_140px_100px] gap-3 border-b border-border-subtle pb-2">
              {["Task", "Status", "Next Due", "Frequency"].map((h) => (
                <span
                  key={h}
                  className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted"
                  style={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  {h}
                </span>
              ))}
            </div>
            {/* Task rows */}
            {equipmentBoardRows.map((row) => (
              <div
                key={`${row.planId}:${row.taskId}`}
                className="grid grid-cols-[1fr_120px_140px_100px] gap-3 border-b border-border-subtle py-2"
              >
                <span className="text-[13px] text-ink-primary">{row.taskName}</span>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: TASK_STATUS_COLORS[row.taskStatus] ?? "var(--ink-secondary)" }}
                >
                  {TASK_STATUS_LABELS[row.taskStatus] ?? row.taskStatus}
                </span>
                <span
                  className="text-[12px] tabular-nums text-ink-secondary"
                  style={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  {row.nextDueDate || "—"}
                </span>
                <span className="text-[12px] text-ink-muted">{row.frequency}</span>
              </div>
            ))}
          </div>
        )}

        {/* Work orders */}
        {equipmentWorkOrders.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <p
              className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-secondary"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Work Orders ({equipmentWorkOrders.length})
            </p>
            <div className="flex flex-col gap-1">
              {equipmentWorkOrders.map((wo) => (
                <div
                  key={wo.id}
                  className="flex items-center gap-3 border border-border-subtle px-3 py-2 text-[13px]"
                >
                  <span
                    className="text-[12px] font-medium tabular-nums text-ink-muted"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {wo.id}
                  </span>
                  <span className="flex-1 text-ink-primary">{wo.description}</span>
                  <span className="text-[12px] text-ink-secondary">{wo.status}</span>
                  <span className="text-[12px] text-ink-muted">{wo.priority}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionPanel>

      {/* ================================================================
          Section 2: Station Flow — Cockpit context (F4-2-R4 section 2)
          Header MUST read "Station Flow" — station context, NOT equipment flow.
          ================================================================ */}
      <SectionPanel
        title="Station Flow"
        subtitle={`Station context · ${stationName} · ${stationTanks.length} tank(s)`}
      >
        {stationTanks.length === 0 ? (
          <p
            className="text-[13px] text-ink-muted py-4 text-center"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            No tanks found for station {stationName}.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stationTanks.map((tank) => (
              <TankGauge
                key={tank.id}
                tankId={tank.id}
                level={tank.currentLevelM3 ?? 0}
                capacity={tank.capacityM3}
                label={tank.tag}
                temperatureF={tank.temperatureF}
                apiGravity={tank.apiGravity}
              />
            ))}
          </div>
        )}
      </SectionPanel>

      {/* ================================================================
          Section 3: Station Integrity — cathodic readings (F4-2-R5, R9)
          Header MUST read "Station Integrity" — station context.
          MUST render explicit empty-state when stationReadings.length === 0.
          MUST NOT render KPI zeros as if real data.
          ================================================================ */}
      <SectionPanel
        title="Station Integrity"
        subtitle={`Station context · ${stationName}`}
      >
        {!hasIntegrityReadings ? (
          /* F4-2-R5: explicit empty-state — REQUIRED when no readings exist */
          <div className="flex flex-col items-center gap-3 py-8">
            <p
              className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              No cathodic readings for this station
            </p>
            <p className="text-[12px] text-ink-tertiary text-center max-w-xs">
              Station {stationName} has no cathodic protection readings in the current dataset.
            </p>
          </div>
        ) : (
          /* F4-2-R9: populated branch — reuse computeIntegrityKpis + extractReadingSeriesForChart */
          <div className="flex flex-col gap-4">
            {/* KPI summary — 3 cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex" style={{ borderLeft: "2px solid var(--status-ok)" }}>
                <KpiCard
                  label="Protected"
                  value={String(integrityKpis.ok)}
                  secondary="OK ≤ −0.85 V"
                  className="flex-1"
                />
              </div>
              <div className="flex" style={{ borderLeft: "2px solid var(--amber-safety)" }}>
                <KpiCard
                  label="Marginal"
                  value={String(integrityKpis.warning)}
                  secondary="WARNING"
                  className="flex-1"
                />
              </div>
              <div className="flex" style={{ borderLeft: "2px solid var(--alarm-red)" }}>
                <KpiCard
                  label="Unprotected"
                  value={String(integrityKpis.critical)}
                  secondary="CRITICAL > −0.75 V"
                  className="flex-1"
                />
              </div>
            </div>

            {/* Point count and chart for first/most-recent point */}
            <p
              className="text-[12px] text-ink-muted"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {integrityRows.length} unique cathodic point(s) at station {stationName}
            </p>

            {/* Time series chart for the first cathodic point */}
            {integrityChartSeries.length > 0 && firstRowKey && (
              <div className="border border-border-subtle p-3">
                <p
                  className="mb-2 text-[11px] uppercase tracking-[0.1em] text-ink-muted"
                  style={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  Point {firstRowKey} — potential history
                </p>
                <TimeSeriesChart
                  series={integrityChartSeries}
                  thresholds={INTEGRITY_THRESHOLDS}
                  height={200}
                />
              </div>
            )}

            {/* Readings table — all points for this station */}
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[80px_1fr_120px_80px] gap-3 border-b border-border-subtle pb-2">
                {["km", "Point", "Latest (V)", "Level"].map((h) => (
                  <span
                    key={h}
                    className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {integrityRows.map((row) => (
                <div
                  key={row.pointKey}
                  className="grid grid-cols-[80px_1fr_120px_80px] gap-3 border-b border-border-subtle py-1.5"
                >
                  <span
                    className="text-[12px] tabular-nums text-ink-secondary"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {row.km.toFixed(1)}
                  </span>
                  <span
                    className="text-[12px] text-ink-primary truncate"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {row.pointKey}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] tabular-nums font-medium",
                      row.level === "OK"
                        ? "text-[var(--status-ok)]"
                        : row.level === "WARNING"
                          ? "text-[var(--amber-safety)]"
                          : "text-[var(--alarm-red)]",
                    )}
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {row.latestPotentialV.toFixed(3)}
                  </span>
                  <span
                    className="text-[11px] text-ink-muted"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {row.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

// ============================================================================
// Page export
// ============================================================================

/**
 * EquipmentPage — equipment aggregate detail page.
 *
 * No Suspense boundary needed here: this page uses useParams() (not useSearchParams()),
 * which does NOT trigger CSR bailout. useParams() is synchronous in client components
 * and does not require a Suspense wrapper per Next.js docs.
 *
 * F4-2-R1: route at /equipment/[id]
 * F4-2-R2: uses useParams() in client component (correct — no await needed)
 */
export default function EquipmentPage() {
  return <EquipmentPageBody />;
}
