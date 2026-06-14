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

import { TankGauge } from "@/components/cockpit/TankGauge";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";
import { ReadoutStat } from "@/components/shared/ReadoutStat";

import type { ThresholdLine } from "@/components/charts/TimeSeriesChart";
import type { AlertLevel } from "@/lib/domain";
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
  { value: CATHODIC_OK, label: `Protegido (${CATHODIC_OK}V)`, color: STATUS_OK },
  { value: CATHODIC_WARN, label: `Marginal (${CATHODIC_WARN}V)`, color: STATUS_WARNING },
];

const TASK_STATUS_LABELS: Record<string, string> = {
  OVERDUE: "Vencida",
  UPCOMING: "Próxima",
  OK: "OK",
};

// Task-status → deck status class. Maps the EXISTING task-status union
// (OVERDUE / UPCOMING / OK) onto the semantic OK/WARNING/CRITICAL palette.
// No threshold logic is invented here — this only re-skins values that the
// maintenance selector already produced.
const TASK_STATUS_TEXT_CLASS: Record<string, string> = {
  OVERDUE: "mc-status mc-status--critical",
  UPCOMING: "mc-status mc-status--warning",
  OK: "mc-status mc-status--ok",
};

// Cathodic reading level → deck status text class. Levels (OK / WARNING /
// CRITICAL) come straight from buildReadingTableRowsFromReadings — unchanged.
const READING_LEVEL_TEXT_CLASS: Record<string, string> = {
  OK: "mc-status mc-status--ok",
  WARNING: "mc-status mc-status--warning",
  CRITICAL: "mc-status mc-status--critical",
};

// ============================================================================
// Status roll-up helpers
// ----------------------------------------------------------------------------
// Reduce an EXISTING set of per-row statuses to the worst level, used only to
// drive the InstrumentBezel header lamp. These do not introduce new thresholds;
// they aggregate statuses the domain selectors already computed.
// ============================================================================

/** Worst alert level across maintenance task statuses (OVERDUE > UPCOMING > OK). */
function worstTaskAlertLevel(
  statuses: readonly string[],
): AlertLevel | undefined {
  if (statuses.length === 0) return undefined;
  if (statuses.includes("OVERDUE")) return "CRITICAL";
  if (statuses.includes("UPCOMING")) return "WARNING";
  return "OK";
}

/** Worst alert level across cathodic reading levels (CRITICAL > WARNING > OK). */
function worstReadingAlertLevel(
  levels: readonly string[],
): AlertLevel | undefined {
  if (levels.length === 0) return undefined;
  if (levels.includes("CRITICAL")) return "CRITICAL";
  if (levels.includes("WARNING")) return "WARNING";
  return "OK";
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

  // Section-level status roll-ups (drive the bezel header lamps only).
  const maintenanceStatus = useMemo(
    () => worstTaskAlertLevel(equipmentBoardRows.map((r) => r.taskStatus)),
    [equipmentBoardRows],
  );

  const integrityStatus = useMemo(
    () => worstReadingAlertLevel(integrityRows.map((r) => r.level)),
    [integrityRows],
  );

  // ---------------------------------------------------------------------------
  // Conditional returns — ALL hooks have already run above this point.
  // ---------------------------------------------------------------------------

  // Loading guard — world is bundled seed, always available quickly
  if (!world) {
    return (
      <div className="mc-deck">
        <div className="flex items-center justify-center py-32">
          <span
            className="text-[13px] uppercase tracking-[0.12em] text-ink-muted"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Cargando datos del sistema…
          </span>
        </div>
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
    <div className="mc-deck">
      <div className="mx-auto max-w-panel px-4 py-5 sm:px-6 flex flex-col gap-4">
        {/* ================================================================
            Deck header — eyebrow + equipment identity.
            No status lamp here: equipment has no live "overall status";
            `criticality` is a static classification, NOT an AlertLevel.
            ================================================================ */}
        <header className="flex flex-col gap-1">
          <span className="mc-rail-eyebrow">Mission Control · Equipo</span>
          <h1
            className="mt-1 text-[18px] font-medium uppercase tracking-[0.14em] text-ink-primary"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {equipment.tag} — {equipment.name}
          </h1>
        </header>

        {/* ================================================================
            Identity / metadata instrument
            ================================================================ */}
        <InstrumentBezel label="Identificación" sublabel="Metadatos del equipo">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-4">
            <ReadoutStat label="Tag" value={equipment.tag} />
            <ReadoutStat label="Tipo" value={equipment.type} />
            <ReadoutStat label="Criticidad" value={equipment.criticality} />
            <ReadoutStat label="Estación" value={stationName} />
          </div>
        </InstrumentBezel>

        {/* F4-2-R6/R7, F4-3-R2, F4-3-S6: hub-and-spoke cross-module links.
            exclude=['equipment'] since we are already on the equipment page.
            resolved is non-null at runtime (notFound() above throws when null);
            CrossNavLinks also handles null defensively. */}
        <InstrumentBezel label="Navegación" sublabel="Vínculos cruzados de módulo">
          <div className="p-4">
            <CrossNavLinks entity={resolved} exclude={["equipment"]} />
          </div>
        </InstrumentBezel>

        {/* ================================================================
            Section 1: Maintenance (F4-2-R4, R8)
            ================================================================ */}
        <InstrumentBezel
          label="Mantención"
          sublabel={`${equipmentBoardRows.length} tarea(s) · ${equipmentWorkOrders.length} OT`}
          status={maintenanceStatus}
        >
          <div className="flex flex-col gap-4 p-4">
            {/* Maintenance tasks table */}
            {equipmentBoardRows.length === 0 ? (
              <p
                className="text-[13px] text-ink-muted py-4 text-center"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                Sin tareas de mantenimiento para este equipo.
              </p>
            ) : (
              /* overflow-x-auto: fixed-column grid scrolls horizontally on mobile (B-2) */
              <div className="overflow-x-auto">
                <div className="flex flex-col gap-1 min-w-[480px]">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_120px_140px_100px] gap-3 border-b border-border-subtle pb-2">
                    {["Tarea", "Estado", "Próximo vencimiento", "Frecuencia"].map((h) => (
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
                        className={cn(
                          "text-[12px]",
                          TASK_STATUS_TEXT_CLASS[row.taskStatus],
                        )}
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
              </div>
            )}

            {/* Work orders */}
            {equipmentWorkOrders.length === 0 ? (
              <p
                className="text-[12px] text-ink-muted py-2"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                Sin órdenes de trabajo para este equipo.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                <p
                  className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-secondary"
                  style={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  Órdenes de trabajo ({equipmentWorkOrders.length})
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
          </div>
        </InstrumentBezel>

        {/* ================================================================
            Section 2: Station Flow — Cockpit context (F4-2-R4 section 2)
            Header MUST read "Flujo de la estación" — station context, NOT equipment flow.
            ================================================================ */}
        <InstrumentBezel
          label="Flujo de la estación"
          sublabel={`${stationName} · ${stationTanks.length} tanque(s)`}
        >
          <div className="p-4">
            {stationTanks.length === 0 ? (
              <p
                className="text-[13px] text-ink-muted py-4 text-center"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                Sin tanques para la estación {stationName}.
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
          </div>
        </InstrumentBezel>

        {/* ================================================================
            Section 3: Station Integrity — cathodic readings (F4-2-R5, R9)
            Header MUST read "Station Integrity" — station context.
            MUST render explicit empty-state when stationReadings.length === 0.
            MUST NOT render KPI zeros as if real data.
            ================================================================ */}
        <InstrumentBezel
          label="Integridad de la estación"
          sublabel={`Contexto · ${stationName}`}
          status={hasIntegrityReadings ? integrityStatus : undefined}
        >
          <div className="p-4">
            {!hasIntegrityReadings ? (
              /* F4-2-R5: explicit empty-state — REQUIRED when no readings exist */
              <div className="flex flex-col items-center gap-3 py-8">
                <p
                  className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted"
                  style={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  Sin lecturas catódicas para esta estación
                </p>
                <p className="text-[12px] text-ink-tertiary text-center max-w-xs">
                  La estación {stationName} no tiene lecturas de protección catódica en el conjunto de datos actual.
                </p>
              </div>
            ) : (
              /* F4-2-R9: populated branch — reuse computeIntegrityKpis + extractReadingSeriesForChart */
              <div className="flex flex-col gap-4">
                {/* KPI summary — instrument readouts. Status lamps reflect the
                    EXISTING integrity classification: protected=OK, marginal=WARNING,
                    unprotected=CRITICAL. Lamps are suppressed when the count is 0
                    so a zero never lights a semantic lamp. */}
                <div className="grid grid-cols-1 gap-x-4 gap-y-4 border border-border-subtle p-4 sm:grid-cols-3">
                  <ReadoutStat
                    label="Protegidos"
                    value={integrityKpis.ok}
                    secondary="OK ≤ −0.85 V"
                    status={integrityKpis.ok > 0 ? "OK" : undefined}
                  />
                  <ReadoutStat
                    label="Marginales"
                    value={integrityKpis.warning}
                    secondary="ADVERTENCIA"
                    status={integrityKpis.warning > 0 ? "WARNING" : undefined}
                  />
                  <ReadoutStat
                    label="Sin protección"
                    value={integrityKpis.critical}
                    secondary="CRÍTICO > −0.75 V"
                    status={integrityKpis.critical > 0 ? "CRITICAL" : undefined}
                  />
                </div>

                {/* Point count and chart for first/most-recent point */}
                <p
                  className="text-[12px] text-ink-muted"
                  style={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  {integrityRows.length} punto(s) catódico(s) únicos en la estación {stationName}
                </p>

                {/* Time series chart for the first cathodic point */}
                {integrityChartSeries.length > 0 && firstRowKey && (
                  <div className="border border-border-subtle p-3">
                    <p
                      className="mb-2 text-[11px] uppercase tracking-[0.1em] text-ink-muted"
                      style={{ fontFamily: "var(--font-mono), monospace" }}
                    >
                      Punto {firstRowKey} — historial de potencial
                    </p>
                    <TimeSeriesChart
                      series={integrityChartSeries}
                      thresholds={INTEGRITY_THRESHOLDS}
                      height={200}
                    />
                  </div>
                )}

                {/* Readings table — all points for this station */}
                {/* overflow-x-auto: fixed-column grid scrolls horizontally on mobile (B-4) */}
                <div className="overflow-x-auto">
                  <div className="flex flex-col gap-1 min-w-[380px]">
                    <div className="grid grid-cols-[80px_1fr_120px_80px] gap-3 border-b border-border-subtle pb-2">
                      {["km", "Punto", "Último (V)", "Nivel"].map((h) => (
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
                            "text-[12px] tabular-nums",
                            READING_LEVEL_TEXT_CLASS[row.level],
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
              </div>
            )}
          </div>
        </InstrumentBezel>
      </div>
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
