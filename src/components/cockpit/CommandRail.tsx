"use client";

/**
 * CommandRail — full-width top telemetry strip.
 * Master status (global alarm state) | global readouts | sim clock + transport.
 * MC SIGNATURE #1 — the emotional anchor of the deck.
 */

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useSimulationStore,
  useActiveFlows,
  useIsRunning,
  useSpeedMultiplier,
  useSimulatedTimeSeconds,
} from "@/store/simulationStore";
import { SIM_SPEEDS, AlertLevel } from "@/lib/domain";
import { computeCompliance } from "@/lib/volumetrics/compliance";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";
import { computeBalance } from "@/lib/volumetrics/balance";
import { MovementType } from "@/lib/domain";
import type { PipelineWorld } from "@/lib/domain";
import { tankRatioToLevel } from "@/lib/simulation/tankLevel";
import { ReadoutStat } from "@/components/shared/ReadoutStat";

// ============================================================================
// TYPES
// ============================================================================

interface CommandRailProps {
  world: PipelineWorld;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Spanish month abbreviations (uppercase). */
const MONTHS_ES = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
] as const;

function formatSimTime(epochMs: number): string {
  if (epochMs === 0) return "-- --- ---- · --:--:--";
  const d = new Date(epochMs);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mmm = MONTHS_ES[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${dd} ${mmm} ${yyyy} · ${hh}:${mm}:${ss}`;
}

function formatKiloM3(m3: number): string {
  return `${(m3 / 1000).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
}

/** Map a canonical compliance band to its deck alert level. */
const COMPLIANCE_BAND_TO_LEVEL: Record<ComplianceBand, AlertLevel> = {
  ok: AlertLevel.OK,
  warning: AlertLevel.WARNING,
  critical: AlertLevel.CRITICAL,
};

/**
 * Balance discrepancy → alert level (SR-012 req 4).
 * green ≤ 0.5 %, amber ≤ 1.0 %, red otherwise.
 */
function balanceLevel(pct: number): AlertLevel {
  if (pct <= 0.5) return AlertLevel.OK;
  if (pct <= 1.0) return AlertLevel.WARNING;
  return AlertLevel.CRITICAL;
}

// ============================================================================
// MASTER STATUS BLOCK
// ============================================================================

interface MasterStatusProps {
  world: PipelineWorld;
}

function MasterStatus({ world }: MasterStatusProps) {
  // Read all tank levels with shallow equality — one subscription for the whole panel
  const tankLevels = useSimulationStore(useShallow((s) => s.tankLevels));

  const { globalStatus, criticalCount, warningCount } = useMemo(() => {
    let critical = 0;
    let warning = 0;

    for (const tank of world.tanks) {
      const level = tankLevels[tank.id] ?? tank.currentLevelM3;
      const ratio = tank.capacityM3 > 0 ? level / tank.capacityM3 : 0;
      const lvl = tankRatioToLevel(ratio);
      if (lvl === AlertLevel.CRITICAL) critical++;
      else if (lvl === AlertLevel.WARNING) warning++;
    }

    let status: AlertLevel = AlertLevel.OK;
    if (critical > 0) status = AlertLevel.CRITICAL;
    else if (warning > 0) status = AlertLevel.WARNING;

    return { globalStatus: status, criticalCount: critical, warningCount: warning };
  }, [tankLevels, world.tanks]);

  const statusLabel =
    globalStatus === AlertLevel.CRITICAL
      ? `ALARMA · ${criticalCount} TANQUE${criticalCount !== 1 ? "S" : ""}`
      : globalStatus === AlertLevel.WARNING
        ? `PRECAUCIÓN · ${warningCount} TANQUE${warningCount !== 1 ? "S" : ""}`
        : "SISTEMA NOMINAL";

  const statusClass =
    globalStatus === AlertLevel.CRITICAL
      ? "mc-status mc-status--critical text-2xl"
      : globalStatus === AlertLevel.WARNING
        ? "mc-status mc-status--warning text-2xl"
        : "mc-status mc-status--ok text-2xl";

  const lampClass =
    globalStatus === AlertLevel.CRITICAL
      ? "mc-lamp mc-lamp--critical"
      : globalStatus === AlertLevel.WARNING
        ? "mc-lamp mc-lamp--warning"
        : "mc-lamp mc-lamp--ok";

  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className={lampClass} aria-hidden="true" />
      <span className={statusClass} aria-live="polite" aria-label={`Estado global: ${statusLabel}`}>
        {statusLabel}
      </span>
    </div>
  );
}

// ============================================================================
// SIM CLOCK + TRANSPORT
// ============================================================================

function SimTransport() {
  const simulatedTimeSeconds = useSimulatedTimeSeconds();
  const simulatedTimeMs = simulatedTimeSeconds * 1000;
  const display = formatSimTime(simulatedTimeMs);

  const isRunning = useIsRunning();
  const speedMultiplier = useSpeedMultiplier();
  const start = useSimulationStore((s) => s.start);
  const pause = useSimulationStore((s) => s.pause);
  const setSpeed = useSimulationStore((s) => s.setSpeed);

  return (
    <div className="flex items-center gap-4">
      {/* Clock */}
      <time
        dateTime={simulatedTimeMs > 0 ? new Date(simulatedTimeMs).toISOString() : undefined}
        className="text-[13px] tabular-nums text-ink-secondary"
        style={{ fontFamily: "var(--font-mono), monospace" }}
        aria-label={`Tiempo simulado: ${display}`}
      >
        {display}
      </time>

      <div className="mc-divider hidden sm:block" style={{ height: "24px" }} />

      {/* Play/pause */}
      <button
        onClick={() => (isRunning ? pause() : start())}
        className="flex items-center justify-center w-8 h-8 border border-border-mid text-ink-secondary hover:text-ink-primary hover:border-border-strong transition-colors text-sm"
        style={{ fontFamily: "var(--font-mono), monospace", borderRadius: "1px" }}
        aria-label={isRunning ? "Pausar simulación" : "Iniciar simulación"}
        title={isRunning ? "Pausar" : "Iniciar"}
      >
        {isRunning ? "⏸" : "▶"}
      </button>

      {/* Speed buttons */}
      <div className="flex items-center gap-1">
        {SIM_SPEEDS.map((speed) => {
          const isActive = speedMultiplier === speed;
          return (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              className={
                isActive
                  ? "mc-speed-active px-2 py-0.5 text-[11px] border"
                  : "px-2 py-0.5 text-[11px] border border-border-subtle text-ink-muted hover:text-ink-secondary hover:border-border-mid transition-colors"
              }
              style={{ fontFamily: "var(--font-mono), monospace", borderRadius: "1px" }}
              aria-label={`Velocidad ${speed}×`}
              aria-pressed={isActive}
            >
              {speed}×
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// GLOBAL READOUTS
// ============================================================================

interface GlobalReadoutsProps {
  world: PipelineWorld;
}

function GlobalReadouts({ world }: GlobalReadoutsProps) {
  const activeFlows = useActiveFlows();

  // Static derived values from movements/targets — only recompute when world changes
  const { totalRecibido, totalEntregado, compliance, balancePct } = useMemo(() => {
    const recibido = world.movements
      .filter(
        (m) => m.type === MovementType.RECEPTION || m.type === MovementType.VESSEL_UNLOAD,
      )
      .reduce((sum, m) => sum + m.volumeGsvM3, 0);

    const entregado = world.movements
      .filter(
        (m) =>
          m.type === MovementType.REFINERY_DELIVERY ||
          m.type === MovementType.VESSEL_LOAD ||
          m.type === MovementType.PIPELINE,
      )
      .reduce((sum, m) => sum + m.volumeGsvM3, 0);

    const totalReal = world.volumeTargets.reduce((sum, vt) => sum + (vt.realM3 ?? 0), 0);
    const totalPrograma = world.volumeTargets.reduce((sum, vt) => sum + vt.programM3, 0);
    const totalPresupuesto = world.volumeTargets.reduce((sum, vt) => sum + vt.budgetM3, 0);

    const comp =
      totalPrograma > 0
        ? computeCompliance({
            shipperId: "total",
            real: totalReal,
            programa: totalPrograma,
            presupuesto: totalPresupuesto,
          })
        : null;

    // Balance (SR-012): aggregate volumetric discrepancy across all tanks.
    // measured == initial for the static seed world (matches CockpitKPIs).
    const tankIds = new Set(world.tanks.map((t) => t.id));
    const initialTotal = world.tanks.reduce((sum, t) => sum + t.currentLevelM3, 0);
    const balance = computeBalance({
      initial: initialTotal,
      inputs: world.movements
        .filter((m) => tankIds.has(m.toNodeId))
        .map((m) => m.volumeGsvM3),
      outputs: world.movements
        .filter((m) => tankIds.has(m.fromNodeId))
        .map((m) => m.volumeGsvM3),
      measured: initialTotal,
    });

    return {
      totalRecibido: recibido,
      totalEntregado: entregado,
      compliance: comp,
      balancePct: balance.percentage,
    };
  }, [world]);

  // Live: total flow rate from active flows
  const totalFlowRate = useMemo(
    () => activeFlows.reduce((sum, f) => sum + f.flowRateM3h, 0),
    [activeFlows],
  );

  const complianceValue = compliance
    ? `${compliance.cumplimientoPrograma.toFixed(1)}%`
    : "—";

  // Use the canonical compliance band (accounts for both programa and
  // presupuesto, same as WaterfallChart). No data → no lamp.
  const complianceStatus: AlertLevel | undefined = compliance
    ? COMPLIANCE_BAND_TO_LEVEL[compliance.band]
    : undefined;

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <ReadoutStat
        label="Caudal total"
        value={totalFlowRate.toFixed(0)}
        unit="m³/h"
      />
      <div className="mc-divider" style={{ height: "32px" }} />
      <ReadoutStat
        label="Recibido"
        value={formatKiloM3(totalRecibido)}
        unit="m³"
      />
      <div className="mc-divider" style={{ height: "32px" }} />
      <ReadoutStat
        label="Entregado"
        value={formatKiloM3(totalEntregado)}
        unit="m³"
      />
      <div className="mc-divider" style={{ height: "32px" }} />
      <ReadoutStat
        label="Cumplimiento"
        value={complianceValue}
        status={complianceStatus}
      />
      <div className="mc-divider" style={{ height: "32px" }} />
      <ReadoutStat
        label="Balance"
        value={`${balancePct.toFixed(1)} %`}
        secondary="Discrepancia volumétrica"
        status={balanceLevel(balancePct)}
      />
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * CommandRail — full-width sticky top strip.
 * Left: master status (alarm anchor). Center: global readouts. Right: sim clock + transport.
 */
export function CommandRail({ world }: CommandRailProps) {
  return (
    <div className="mc-command-rail">
      <div className="mx-auto max-w-panel px-4 pt-1.5 pb-3 sm:px-6">
        {/* Deck eyebrow — signals this is the command deck header */}
        <div className="mb-1.5 flex items-center gap-2">
          <span className="mc-rail-eyebrow">Mission Control · Deck</span>
          <span className="mc-lamp mc-lamp--flow" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left — master status */}
          <MasterStatus world={world} />

          {/* Center — global readouts */}
          <GlobalReadouts world={world} />

          {/* Right — sim clock + transport */}
          <SimTransport />
        </div>
      </div>
    </div>
  );
}
