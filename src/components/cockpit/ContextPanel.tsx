"use client";

/**
 * ContextPanel — selected node detail panel for the cockpit.
 * SR-005 req 10 (selected node state), SR-014 req 2 (no coarse store subscriptions).
 * Shows tank/station details for the selected node.
 * UI copy: Spanish.
 */

import { useSelectionStore } from "@/store/selectionStore";
import type { PipelineWorld, Tank, Station } from "@/lib/domain";
import { TELEMETRY_BLUE, STATUS_WARNING, AMBER_SAFETY } from "@/lib/charts/palette";

// ============================================================================
// TYPES
// ============================================================================

export interface ContextPanelProps {
  world: PipelineWorld;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatM3(value: number): string {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " m³";
}

function formatPercent(value: number): string {
  return value.toFixed(1) + " %";
}

function getLevelColor(ratio: number): string {
  if (ratio >= 0.95) return AMBER_SAFETY;
  if (ratio >= 0.85) return STATUS_WARNING;
  return TELEMETRY_BLUE;
}

// ============================================================================
// TANK DETAIL
// ============================================================================

interface TankDetailProps {
  tank: Tank;
}

function TankDetail({ tank }: TankDetailProps) {
  const ratio = tank.currentLevelM3 / tank.capacityM3;
  const fillPercent = ratio * 100;
  const levelColor = getLevelColor(ratio);
  const monoStyle = { fontFamily: "var(--font-mono), monospace" };

  return (
    <div className="flex flex-col gap-3">
      {/* Tank identity */}
      <div>
        <p
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={monoStyle}
        >
          Tanque
        </p>
        <p className="text-sm font-medium text-ink-primary" style={monoStyle}>
          {tank.tag}
        </p>
        <p className="text-[10px] text-ink-muted" style={monoStyle}>
          {tank.product}
        </p>
      </div>

      {/* Fill level bar */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] uppercase tracking-[0.12em] text-ink-tertiary"
            style={monoStyle}
          >
            Nivel
          </span>
          <span className="text-[11px] tabular-nums" style={{ ...monoStyle, color: levelColor }}>
            {formatPercent(fillPercent)}
          </span>
        </div>
        {/* Progress bar — instrument aesthetic */}
        <div className="h-1.5 w-full border border-border-subtle bg-surface-base">
          <div
            className="h-full transition-all duration-200"
            style={{ width: `${Math.min(fillPercent, 100)}%`, backgroundColor: levelColor }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-ink-muted" style={monoStyle}>
            {formatM3(tank.currentLevelM3)}
          </span>
          <span className="text-[9px] text-ink-muted" style={monoStyle}>
            / {formatM3(tank.capacityM3)}
          </span>
        </div>
      </div>

      {/* Tank metrics */}
      <div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-[0.12em] text-ink-muted" style={monoStyle}>
            Temp.
          </span>
          <span className="text-[11px] tabular-nums text-ink-secondary" style={monoStyle}>
            {tank.temperatureF.toFixed(1)} °F
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-[0.12em] text-ink-muted" style={monoStyle}>
            API
          </span>
          <span className="text-[11px] tabular-nums text-ink-secondary" style={monoStyle}>
            {tank.apiGravity.toFixed(1)} °
          </span>
        </div>
      </div>

      {/* High-level alarm indicator */}
      {ratio >= 0.95 && (
        <div
          className="border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em]"
          style={{
            borderColor: AMBER_SAFETY,
            color: AMBER_SAFETY,
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          ⚠ Alarma nivel alto
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STATION DETAIL
// ============================================================================

interface StationDetailProps {
  station: Station;
  world: PipelineWorld;
}

function StationDetail({ station, world }: StationDetailProps) {
  const stationTanks = world.tanks.filter((t) => t.stationId === station.id);
  const monoStyle = { fontFamily: "var(--font-mono), monospace" };

  return (
    <div className="flex flex-col gap-3">
      {/* Station identity */}
      <div>
        <p
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={monoStyle}
        >
          Estación
        </p>
        <p className="text-sm font-medium text-ink-primary" style={monoStyle}>
          {station.name}
        </p>
        <p className="text-[10px] text-ink-muted" style={monoStyle}>
          PK {station.km} km · {station.kind}
        </p>
      </div>

      {/* Station tanks summary */}
      {stationTanks.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
          <p className="text-[9px] uppercase tracking-[0.12em] text-ink-muted" style={monoStyle}>
            Tanques ({stationTanks.length})
          </p>
          {stationTanks.map((tank) => {
            const ratio = tank.currentLevelM3 / tank.capacityM3;
            return (
              <div key={tank.id} className="flex items-center justify-between">
                <span className="text-[10px] text-ink-secondary" style={monoStyle}>
                  {tank.tag}
                </span>
                <span
                  className="text-[10px] tabular-nums"
                  style={{ ...monoStyle, color: getLevelColor(ratio) }}
                >
                  {formatPercent(ratio * 100)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ContextPanel shows details for the selected node (tank or station).
 * Uses fine-grained selection selector — no coarse store subscription.
 * SR-005 req 10, SR-014 req 2.
 */
export function ContextPanel({ world }: ContextPanelProps) {
  // Fine-grained selectors — read only what we need, no coarse subscription
  const selectedEntityId = useSelectionStore((state) => state.selectedEntityId);
  const selectedEntityType = useSelectionStore((state) => state.selectedEntityType);

  const monoStyle = { fontFamily: "var(--font-mono), monospace" };

  // Resolve selected entity
  const selectedTank =
    selectedEntityType === "tank"
      ? (world.tanks.find((t) => t.id === selectedEntityId) ?? null)
      : null;

  const selectedStation =
    selectedEntityType === "station"
      ? (world.stations.find((s) => s.id === selectedEntityId) ?? null)
      : null;

  return (
    <aside
      className="flex h-full flex-col gap-3 border border-border-mid bg-surface-raised p-4"
      aria-label="Panel de Contexto"
    >
      {/* Panel header */}
      <header>
        <h2
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={monoStyle}
        >
          Contexto
        </h2>
      </header>

      {/* Content — conditional on selection */}
      <div className="flex-1">
        {!selectedEntityId && (
          <div className="flex h-full items-center justify-center py-8">
            <p
              className="text-center text-[10px] uppercase tracking-[0.12em] text-ink-muted"
              style={monoStyle}
            >
              Seleccione un nodo en el diagrama
            </p>
          </div>
        )}

        {selectedTank && <TankDetail tank={selectedTank} />}

        {selectedStation && !selectedTank && (
          <StationDetail station={selectedStation} world={world} />
        )}

        {selectedEntityId && !selectedTank && !selectedStation && (
          <div className="flex h-full items-center justify-center py-8">
            <p
              className="text-center text-[10px] uppercase tracking-[0.12em] text-ink-muted"
              style={monoStyle}
            >
              Sin detalle disponible para este nodo
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
