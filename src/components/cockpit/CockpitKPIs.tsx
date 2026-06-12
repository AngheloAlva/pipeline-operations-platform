"use client";

/**
 * CockpitKPIs — 4 KpiCard instruments for the cockpit header row.
 * SR-012: Recibido, Entregado, Cumplimiento, Balance — all from seed world data.
 * Color thresholds per SR-012 req 4–5.
 * Styling: hairline frame, no radius, Geist Mono value, uppercase Spanish label, left accent bar.
 */

import { useMemo } from "react";
import type { PipelineWorld, AlertLevel } from "@/lib/domain";
import { computeBalance } from "@/lib/volumetrics/balance";
import { computeCompliance } from "@/lib/volumetrics/compliance";
import { KpiCard } from "@/components/ui/KpiCard";

// ============================================================================
// TYPES
// ============================================================================

export interface CockpitKPIsProps {
  world: PipelineWorld;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatM3(value: number): string {
  return `${(value / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}k m³`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)} %`;
}

/**
 * Determine balance alert level from discrepancy percentage.
 * SR-012 req 4: green ≤0.5%, amber 0.5–1%, red >1%.
 */
function balanceLevel(percentage: number): AlertLevel {
  if (percentage <= 0.5) return "OK";
  if (percentage <= 1.0) return "WARNING";
  return "CRITICAL";
}

/**
 * Determine compliance alert level.
 * SR-012 req 5: green 95–105%, otherwise amber/red.
 */
function complianceLevel(cumplimiento: number): AlertLevel {
  if (cumplimiento >= 95 && cumplimiento <= 105) return "OK";
  if (cumplimiento >= 90 && cumplimiento <= 110) return "WARNING";
  return "CRITICAL";
}

/**
 * Derive KPI values from world data.
 * All values computed from seed movements and volume targets.
 * SR-012 req 3.
 */
function deriveCockpitKPIs(world: PipelineWorld) {
  const movements = world.movements;

  // Recibido (m³): sum of reception movements (inflows to the system)
  const recibido = movements
    .filter((m) => m.type === "RECEPTION" || m.type === "VESSEL_UNLOAD")
    .reduce((sum, m) => sum + m.volumeGsvM3, 0);

  // Entregado (m³): sum of delivery/pipeline-out movements
  const entregado = movements
    .filter(
      (m) => m.type === "REFINERY_DELIVERY" || m.type === "VESSEL_LOAD" || m.type === "PIPELINE",
    )
    .reduce((sum, m) => sum + m.volumeGsvM3, 0);

  // Cumplimiento (%): aggregate real vs programa from volumeTargets
  const totalReal = world.volumeTargets.reduce((sum, t) => sum + (t.realM3 ?? 0), 0);
  const totalPrograma = world.volumeTargets.reduce((sum, t) => sum + t.programM3, 0);
  const totalPresupuesto = world.volumeTargets.reduce((sum, t) => sum + t.budgetM3, 0);

  const compliance =
    totalPrograma > 0
      ? computeCompliance({
          shipperId: "total",
          real: totalReal,
          programa: totalPrograma,
          presupuesto: totalPresupuesto,
        })
      : null;

  // Balance (%): aggregate volumetric balance across all tanks
  const tankIds = new Set(world.tanks.map((t) => t.id));
  const initialTotal = world.tanks.reduce((sum, t) => sum + t.currentLevelM3, 0);
  const inputs = movements.filter((m) => tankIds.has(m.toNodeId)).map((m) => m.volumeGsvM3);
  const outputs = movements.filter((m) => tankIds.has(m.fromNodeId)).map((m) => m.volumeGsvM3);
  const measured = initialTotal; // seed measured == initial for fresh world

  const balance = computeBalance({
    initial: initialTotal,
    inputs,
    outputs,
    measured,
  });

  return {
    recibido,
    entregado,
    cumplimiento: compliance?.cumplimientoPrograma ?? 0,
    balancePercentage: balance.percentage,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * CockpitKPIs renders exactly 4 KpiCard instruments.
 * All values derived from world (seed) data — not from the live simulation state.
 * SR-012.
 */
export function CockpitKPIs({ world }: CockpitKPIsProps) {
  const kpis = useMemo(() => deriveCockpitKPIs(world), [world]);

  return (
    <div
      className="grid grid-cols-2 gap-px border border-border-subtle sm:grid-cols-4"
      aria-label="KPIs del Cockpit"
      role="region"
    >
      {/* KPI 1 — Recibido */}
      <KpiCard
        label="Recibido"
        value={formatM3(kpis.recibido)}
        secondary="Volumen GSV acumulado"
        status="OK"
      />

      {/* KPI 2 — Entregado */}
      <KpiCard
        label="Entregado"
        value={formatM3(kpis.entregado)}
        secondary="Volumen GSV acumulado"
        status="OK"
      />

      {/* KPI 3 — Cumplimiento */}
      <KpiCard
        label="Cumplimiento"
        value={formatPercent(kpis.cumplimiento)}
        secondary="Real vs Programa"
        status={complianceLevel(kpis.cumplimiento)}
      />

      {/* KPI 4 — Balance */}
      <KpiCard
        label="Balance"
        value={formatPercent(kpis.balancePercentage)}
        secondary="Discrepancia volumétrica"
        status={balanceLevel(kpis.balancePercentage)}
      />
    </div>
  );
}
