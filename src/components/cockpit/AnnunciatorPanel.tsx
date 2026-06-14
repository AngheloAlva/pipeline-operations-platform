"use client";

/**
 * AnnunciatorPanel (v2) — a real backlit alarm-annunciator matrix.
 * MC SIGNATURE #2 — the iconic control-room annunciator.
 *
 * Rebuilt as its OWN zone: a full-width recessed band with a labeled engraved
 * edge ("ANUNCIADOR DE ESTACIONES") and a tight grid of FLUSH butted cells
 * separated only by thin cyan dividers — not rounded cards with gaps.
 *
 * Behaviour is the whole point of the panel:
 *   - Nominal cells stay DIM / unlit (calm dark matrix).
 *   - Warning cells backlight amber.
 *   - Critical cells backlight red and pulse — glowing OUT of the grid.
 *
 * Live: single useShallow subscription over tankLevels, one useMemo.
 * Click-to-select-station is preserved.
 */

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSimulationStore } from "@/store/simulationStore";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import { AlertLevel } from "@/lib/domain";
import type { PipelineWorld, Station, Tank } from "@/lib/domain";
import { tankRatioToLevel } from "@/lib/simulation/tankLevel";

// ============================================================================
// TYPES
// ============================================================================

interface AnnunciatorPanelProps {
  world: PipelineWorld;
}

interface StationStatus {
  station: Station;
  tanks: Tank[];
  status: AlertLevel;
  maxFillPct: number | null;
}

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_LABEL: Record<AlertLevel, string> = {
  OK: "nominal",
  WARNING: "precaución",
  CRITICAL: "alarma",
};

const STATUS_SUFFIX: Record<AlertLevel, string> = {
  OK: "ok",
  WARNING: "warning",
  CRITICAL: "critical",
};

// ============================================================================
// ANNUNCIATOR CELL — a single backlit tile
// ============================================================================

interface AnnunciatorCellProps {
  stationStatus: StationStatus;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function AnnunciatorCell({ stationStatus, isSelected, onSelect }: AnnunciatorCellProps) {
  const { station, tanks, status, maxFillPct } = stationStatus;
  const suffix = STATUS_SUFFIX[status];

  const cellClass = [
    "mc-cell",
    `mc-cell--${suffix}`,
    isSelected ? "mc-cell--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const lampClass =
    status === AlertLevel.CRITICAL
      ? "mc-lamp mc-lamp--critical"
      : status === AlertLevel.WARNING
        ? "mc-lamp mc-lamp--warning"
        : "mc-lamp mc-lamp--ok";

  const fillDisplay = maxFillPct !== null ? `${maxFillPct.toFixed(0)}%` : "—";
  const tankCount = tanks.length;

  return (
    <button
      type="button"
      className={cellClass}
      onClick={() => onSelect(station.id)}
      aria-label={`Estación ${station.name}, estado ${STATUS_LABEL[status]}, llenado ${fillDisplay}`}
      aria-pressed={isSelected}
    >
      {/* Lamp + engraved station label */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <span className={`mc-cell__label mc-cell__label--${suffix} truncate`}>
          {station.name}
        </span>
        <span className={lampClass} aria-hidden="true" />
      </div>

      {/* Compact metric */}
      <div className="flex items-baseline justify-between gap-1.5">
        <span className={`mc-cell__metric mc-cell__metric--${suffix}`}>{fillDisplay}</span>
        <span className={`mc-cell__sub mc-cell__sub--${suffix}`}>
          {tankCount > 0 ? `${tankCount} TK` : "— TK"}
        </span>
      </div>
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * AnnunciatorPanel renders the recessed annunciator band: labeled edge with a
 * live tally + the flush backlit cell grid. One subscription, one useMemo.
 */
export function AnnunciatorPanel({ world }: AnnunciatorPanelProps) {
  // Single store subscription — shallow equality prevents render storms
  const tankLevels = useSimulationStore(useShallow((s) => s.tankLevels));

  // Selection
  const selectEntity = useSelectionStore((s) => s.selectEntity);
  const selectedEntityId = useSelectionStore((s) => s.selectedEntityId);

  // Derive per-station status + aggregate tally from live tank levels (single pass)
  const { stationStatuses, warnCount, critCount } = useMemo(() => {
    let warn = 0;
    let crit = 0;

    const statuses: StationStatus[] = world.stations.map((station) => {
      const tanks = world.tanks.filter((t) => t.stationId === station.id);

      if (tanks.length === 0) {
        return { station, tanks: [], status: AlertLevel.OK, maxFillPct: null };
      }

      let maxRatio = 0;
      for (const tank of tanks) {
        const level = tankLevels[tank.id] ?? tank.currentLevelM3;
        const ratio = tank.capacityM3 > 0 ? level / tank.capacityM3 : 0;
        if (ratio > maxRatio) maxRatio = ratio;
      }

      const status = tankRatioToLevel(maxRatio);
      if (status === AlertLevel.CRITICAL) crit++;
      else if (status === AlertLevel.WARNING) warn++;

      return { station, tanks, status, maxFillPct: maxRatio * 100 };
    });

    return { stationStatuses: statuses, warnCount: warn, critCount: crit };
  }, [tankLevels, world.stations, world.tanks]);

  const handleSelect = (id: string) => {
    selectEntity(id, EntityType.STATION);
  };

  const tallyClass =
    critCount > 0
      ? "mc-annun__tally mc-annun__tally--crit"
      : warnCount > 0
        ? "mc-annun__tally mc-annun__tally--warn"
        : "mc-annun__tally mc-annun__tally--idle";

  const tallyLabel =
    critCount > 0
      ? `${critCount} ALARMA${critCount !== 1 ? "S" : ""}`
      : warnCount > 0
        ? `${warnCount} PRECAUCIÓN`
        : "SIN ALARMAS";

  return (
    <section
      className="mc-annun"
      role="region"
      aria-label="Anunciador de estaciones"
    >
      {/* Labeled engraved edge */}
      <div className="mc-annun__edge">
        <span className="mc-annun__title">Anunciador de Estaciones</span>
        <span className="flex items-center gap-3">
          <span className="mc-annun__meta">{stationStatuses.length} EST</span>
          <span className={tallyClass} aria-live="polite">
            <span
              className={
                critCount > 0
                  ? "mc-lamp mc-lamp--critical"
                  : warnCount > 0
                    ? "mc-lamp mc-lamp--warning"
                    : "mc-lamp mc-lamp--ok"
              }
              aria-hidden="true"
            />
            {tallyLabel}
          </span>
        </span>
      </div>

      {/* Flush backlit cell matrix */}
      <div className="mc-annun__grid">
        {stationStatuses.map((ss) => (
          <AnnunciatorCell
            key={ss.station.id}
            stationStatus={ss}
            isSelected={selectedEntityId === ss.station.id}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </section>
  );
}
