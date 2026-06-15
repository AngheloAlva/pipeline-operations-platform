"use client";

/**
 * MaintenanceKpis — maintenance dashboard summary (SR-207).
 *
 * Mission Control redesign (Slice 4): rendered as deck instruments — a module
 * header (eyebrow + title) plus an `InstrumentBezel` framing four `ReadoutStat`
 * readouts (Vencidas / Próximas / OT Abiertas / Equipos Críticos).
 *
 * KPI values from computeMaintenanceKpis(world, now, overrides).
 * now = real-world date (NOT simulatedTime).
 * Memoized: recomputes when world or now changes.
 * No imports from simulationStore or useSimulationLoop.
 *
 * Status mapping is preserved byte-for-byte from the previous KpiCard version:
 *   Vencidas         → CRITICAL when > 0, else OK
 *   Próximas         → WARNING  when > 0, else OK
 *   OT Abiertas      → no status (informational)
 *   Equipos Críticos → WARNING  when > 0, else OK
 */

import { useMemo } from "react";
import type { PipelineWorld, AlertLevel } from "@/lib/domain";
import { computeMaintenanceKpis } from "@/lib/maintenance/selectors";
import { useMaintenanceStore } from "@/store/maintenanceStore";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";
import { ReadoutStat } from "@/components/shared/ReadoutStat";
import { ConceptInfo } from "@/components/shared/ConceptInfo";
import { ConceptHintBadge } from "@/components/shared/ConceptHintBadge";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MaintenanceKpisProps {
  world: PipelineWorld;
  /** Current real-world date as ISO string YYYY-MM-DD (NOT simulatedTime). */
  now: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the module header and four maintenance readouts:
 *   Vencidas | Próximas | OT Abiertas | Equipos Críticos
 *
 * SR-207 §3: now is the real-world date, NOT simulatedTime.
 * SR-207 §6: computeMaintenanceKpis is wrapped in useMemo([world, now]).
 */
export function MaintenanceKpis({ world, now }: MaintenanceKpisProps) {
  const overrides = useMaintenanceStore((s) => s.overrides);

  // Memoized KPI computation — recomputes when world, now, or overrides change (SR-207 §6)
  const kpis = useMemo(
    () => computeMaintenanceKpis(world, now, overrides),
    [world, now, overrides],
  );

  // Status mapping preserved exactly from the prior implementation.
  const vencidasStatus: AlertLevel = kpis.vencidas > 0 ? "CRITICAL" : "OK";
  const proximasStatus: AlertLevel = kpis.proximas > 0 ? "WARNING" : "OK";
  const equiposCriticosStatus: AlertLevel = kpis.equiposCriticos > 0 ? "WARNING" : "OK";

  // Module master status mirrors the worst KPI level so the bezel lamp is honest:
  // any vencidas → CRITICAL; else any próximas / equipos críticos → WARNING; else OK.
  const moduleStatus: AlertLevel =
    vencidasStatus === "CRITICAL"
      ? "CRITICAL"
      : proximasStatus === "WARNING" || equiposCriticosStatus === "WARNING"
        ? "WARNING"
        : "OK";

  return (
    <div className="mx-auto w-full max-w-panel px-4 py-5 sm:px-6">
      {/* Deck module header — eyebrow + title */}
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <span className="mc-rail-eyebrow">Mission Control · Mantención</span>
          <h1 className="mt-1 text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
            Panel de Mantención
          </h1>
        </div>
        <ConceptHintBadge />
      </header>

      {/* Instrument readouts */}
      <InstrumentBezel label="INDICADORES DE MANTENCIÓN" status={moduleStatus}>
        <div className="grid grid-cols-2 gap-px bg-border-subtle sm:grid-cols-4">
          {/* Vencidas — overdue tasks (CRITICAL when > 0) */}
          <div className="bg-surface-raised p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="mc-readout__label">Vencidas</span>
              <ConceptInfo term="mantenimiento-vencido" label="Vencidas" />
            </div>
            <ReadoutStat
              label=""
              value={kpis.vencidas}
              secondary="tareas vencidas"
              status={vencidasStatus}
            />
          </div>

          {/* Próximas — upcoming tasks (WARNING when > 0) */}
          <div className="bg-surface-raised p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="mc-readout__label">Próximas</span>
              <ConceptInfo term="mantenimiento-proximo" label="Próximas" />
            </div>
            <ReadoutStat
              label=""
              value={kpis.proximas}
              secondary="tareas próximas"
              status={proximasStatus}
            />
          </div>

          {/* OT Abiertas — open work orders (informational, no status lamp) */}
          <div className="bg-surface-raised p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="mc-readout__label">OT Abiertas</span>
              <ConceptInfo term="orden-trabajo" label="OT Abiertas" />
            </div>
            <ReadoutStat
              label=""
              value={kpis.otAbiertas}
              secondary="órdenes activas"
            />
          </div>

          {/* Equipos Críticos — critical equipment (WARNING when > 0) */}
          <div className="bg-surface-raised p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="mc-readout__label">Equipos Críticos</span>
              <ConceptInfo term="equipos-criticos" label="Equipos Críticos" />
            </div>
            <ReadoutStat
              label=""
              value={kpis.equiposCriticos}
              secondary="equipos críticos"
              status={equiposCriticosStatus}
            />
          </div>
        </div>
      </InstrumentBezel>
    </div>
  );
}
