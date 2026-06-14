"use client";

/**
 * IntegrityKpis — three cathodic protection counts (OK / WARNING / CRITICAL). SR-307.
 *
 * Mission Control redesign (Slice 5): rendered as deck instruments — an
 * `InstrumentBezel` framing three `ReadoutStat` readouts:
 *   Protegidos      → OK       lamp (green)  — points ≤ −0.85 V
 *   Marginales      → WARNING  lamp (amber)  — ADVERTENCIA
 *   Sin Protección  → CRITICAL lamp (red)    — points > −0.75 V
 *
 * Each readout's lamp is GUARDED BY ITS COUNT: it lights only when that count
 * is > 0. A zero count shows NO lamp (the category is still conveyed by the
 * label + secondary caption) — never a false amber/red alarm on "0". The worst
 * non-zero rollup lives on the bezel master lamp.
 *
 * Counts are PER POINT (by latest reading level per ORCHESTRATOR DECISION).
 * KPI card totals MUST equal ReadingsTable row count.
 * No simulationStore / maintenanceStore imports.
 */

import { useMemo } from "react";
import type { AlertLevel, PipelineWorld } from "@/lib/domain";
import { computeIntegrityKpis } from "@/lib/integrity/selectors";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";
import { ReadoutStat } from "@/components/shared/ReadoutStat";

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
 * Renders 3 ReadoutStat instruments for cathodic protection health.
 * computeIntegrityKpis counts PER UNIQUE POINT — the totals equal the
 * ReadingsTable row count (one row per unique km:segmentId point).
 *
 * The bezel's master lamp mirrors the worst non-zero category so the frame
 * reads honestly: any critical → CRITICAL; else any warning → WARNING; else OK.
 */
export function IntegrityKpis({ world }: IntegrityKpisProps) {
  const kpis = useMemo(
    () => computeIntegrityKpis(world.cathodicReadings),
    [world.cathodicReadings],
  );

  if (world.cathodicReadings.length === 0) {
    return (
      <InstrumentBezel label="ESTADO DE PROTECCIÓN">
        <div className="flex flex-col items-center gap-2 py-8">
          <span aria-hidden="true" className="text-[18px] text-ink-muted opacity-50">
            ○
          </span>
          <p
            className="text-[12px] uppercase tracking-[0.1em] text-ink-muted"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Sin lecturas catódicas disponibles
          </p>
        </div>
      </InstrumentBezel>
    );
  }

  // Master lamp mirrors the worst non-zero category (honest frame status).
  const moduleStatus: AlertLevel =
    kpis.critical > 0 ? "CRITICAL" : kpis.warning > 0 ? "WARNING" : "OK";

  return (
    <InstrumentBezel label="ESTADO DE PROTECCIÓN" status={moduleStatus}>
      <div className="grid grid-cols-1 gap-px bg-border-subtle sm:grid-cols-3 lg:grid-cols-1">
        {/* Protegidos — protected points (OK / green) */}
        <div className="bg-surface-raised p-4">
          <ReadoutStat
            label="Protegidos"
            value={kpis.ok}
            secondary="OK ≤ −0.85 V"
            status={kpis.ok > 0 ? "OK" : undefined}
          />
        </div>

        {/* Marginales — marginal protection (WARNING / amber) */}
        <div className="bg-surface-raised p-4">
          <ReadoutStat
            label="Marginales"
            value={kpis.warning}
            secondary="ADVERTENCIA"
            status={kpis.warning > 0 ? "WARNING" : undefined}
          />
        </div>

        {/* Sin Protección — unprotected points (CRITICAL / red) */}
        <div className="bg-surface-raised p-4">
          <ReadoutStat
            label="Sin Protección"
            value={kpis.critical}
            secondary="CRÍTICO > −0.75 V"
            status={kpis.critical > 0 ? "CRITICAL" : undefined}
          />
        </div>
      </div>
    </InstrumentBezel>
  );
}
