"use client";

/**
 * IntegrityKpis — three KpiCard instances showing OK / WARNING / CRITICAL
 * cathodic point counts. SR-307.
 *
 * Counts are PER POINT (by latest reading level per ORCHESTRATOR DECISION).
 * KPI card totals MUST equal ReadingsTable row count.
 * No simulationStore / maintenanceStore imports.
 */

import { useMemo } from "react";
import { KpiCard } from "@/components/ui/KpiCard";
import { computeIntegrityKpis } from "@/lib/integrity/selectors";
import type { PipelineWorld } from "@/lib/domain";

// ============================================================================
// Props
// ============================================================================

export interface IntegrityKpisProps {
  world: PipelineWorld;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders 3 KpiCard instances for cathodic protection health.
 * computeIntegrityKpis counts PER UNIQUE POINT — the totals equal the
 * ReadingsTable row count (one row per unique km:segmentId point).
 *
 * Accent colors use CSS custom property tokens. The left-border accent is
 * applied via a wrapping div using inline style (wins the cascade) so we do
 * not need to modify KpiCard's interface.
 */
export function IntegrityKpis({ world }: IntegrityKpisProps) {
  const kpis = useMemo(
    () => computeIntegrityKpis(world.cathodicReadings),
    [world.cathodicReadings],
  );

  if (world.cathodicReadings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <span aria-hidden="true" className="text-[18px] text-ink-muted opacity-50">○</span>
        <p
          className="text-[12px] uppercase tracking-[0.1em] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Sin lecturas catódicas disponibles
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* OK — protected points. Wrapper is flex so the KpiCard stretches to the
          grid-stretched wrapper height — keeps the accent bar flush with the card. */}
      <div className="flex" style={{ borderLeft: "2px solid var(--status-ok)" }}>
        <KpiCard
          label="Protegidos"
          value={String(kpis.ok)}
          secondary="OK ≤ −0.85 V"
          className="flex-1"
        />
      </div>

      {/* WARNING — marginal protection */}
      <div className="flex" style={{ borderLeft: "2px solid var(--amber-safety)" }}>
        <KpiCard
          label="Marginales"
          value={String(kpis.warning)}
          secondary="ADVERTENCIA"
          className="flex-1"
        />
      </div>

      {/* CRITICAL — unprotected points */}
      <div className="flex" style={{ borderLeft: "2px solid var(--alarm-red)" }}>
        <KpiCard
          label="Sin Protección"
          value={String(kpis.critical)}
          secondary="CRÍTICO > −0.75 V"
          className="flex-1"
        />
      </div>
    </div>
  );
}
