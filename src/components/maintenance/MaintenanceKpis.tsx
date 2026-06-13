"use client";

/**
 * MaintenanceKpis — 4 KpiCard row for the maintenance dashboard (SR-207).
 *
 * KPI values from computeMaintenanceKpis(world, now).
 * now = real-world date (NOT simulatedTime).
 * Memoized: recomputes only when world changes.
 * No imports from simulationStore or useSimulationLoop.
 */

import { useMemo } from "react";
import type { PipelineWorld } from "@/lib/domain";
import { computeMaintenanceKpis } from "@/lib/maintenance/selectors";
import { KpiCard } from "@/components/ui/KpiCard";

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
 * Renders 4 KpiCard instances in a horizontal row:
 *   Vencidas | Próximas | OT Abiertas | Equipos Críticos
 *
 * SR-207 §3: now is the real-world date, NOT simulatedTime.
 * SR-207 §6: computeMaintenanceKpis is wrapped in useMemo([world]).
 */
export function MaintenanceKpis({ world, now }: MaintenanceKpisProps) {
  // Memoized KPI computation (SR-207 §6)
  const kpis = useMemo(
    () => computeMaintenanceKpis(world, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world],
  );

  return (
    <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
      {/* Vencidas — overdue tasks (SR-207 §4: alarm-red accent) */}
      <KpiCard
        label="Vencidas"
        value={String(kpis.vencidas)}
        secondary="tareas vencidas"
        status={kpis.vencidas > 0 ? "CRITICAL" : "OK"}
      />

      {/* Próximas — upcoming tasks (SR-207 §4: amber-safety accent) */}
      <KpiCard
        label="Próximas"
        value={String(kpis.proximas)}
        secondary="tareas próximas"
        status={kpis.proximas > 0 ? "WARNING" : "OK"}
      />

      {/* OT Abiertas — open work orders (SR-207 §4: status-flow accent) */}
      <KpiCard
        label="OT Abiertas"
        value={String(kpis.otAbiertas)}
        secondary="órdenes activas"
      />

      {/* Equipos Críticos — critical equipment (SR-207 §4: amber-safety or status-warning) */}
      <KpiCard
        label="Equipos Críticos"
        value={String(kpis.equiposCriticos)}
        secondary="equipos críticos"
        status={kpis.equiposCriticos > 0 ? "WARNING" : "OK"}
      />
    </div>
  );
}
