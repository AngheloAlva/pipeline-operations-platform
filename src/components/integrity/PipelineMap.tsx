"use client";

/**
 * PipelineMap — SVG horizontal pipeline kilometer map. SR-306.
 *
 * SVG sizing: phase-1 aspect-ratio recipe (ADR-7):
 *   viewBox + preserveAspectRatio + aspectRatio CSS + maxWidth + mx-auto
 *   NO fixed px height — this is the bug we fixed in phase-1.
 *
 * Three marker layers: stations → rectifiers → cathodic points.
 * Cathodic point markers are clickable (role="button", tabIndex=0, onKeyDown).
 * x-positions from kmToX (src/lib/diagrams/layout.ts).
 * Font: CHART_FONT_MONO resolved string — never CSS var() in SVG context.
 */

import { useCallback, useMemo } from "react";
import {
  STATUS_OK,
  STATUS_WARNING,
  STATUS_CRITICAL,
  INK_TERTIARY,
  AMBER_SAFETY,
  CHART_FONT_MONO,
} from "@/lib/charts/palette";
import { allocateAnchorAwareLanes, kmToX } from "@/lib/diagrams/layout";
import { groupReadingsByKm } from "@/lib/integrity/selectors";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import { AlertLevel, EquipmentType } from "@/lib/domain/types";
import { formatPk } from "@/lib/format";
import type { PipelineWorld } from "@/lib/domain";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";
import { ConceptInfo } from "@/components/shared/ConceptInfo";

// ============================================================================
// Constants
// ============================================================================

const VB_WIDTH = 1080;
const PADDING = 40;
const TOP_LABEL_Y = 14;
const LABEL_LANE_HEIGHT = 12;
const LABEL_TO_BASELINE_GAP = 14;
const BASELINE_TO_LABEL_GAP = 28;
const SVG_BOTTOM_SPACE = 8;
const STATION_NAME_CHARACTER_WIDTH = 5.2;
const PK_CHARACTER_WIDTH = 4.5;
const LABEL_INLINE_GAP = 4;

/** Color map for cathodic point markers by alert level. */
const LEVEL_COLOR: Record<AlertLevel, string> = {
  [AlertLevel.OK]: STATUS_OK,
  [AlertLevel.WARNING]: STATUS_WARNING,
  [AlertLevel.CRITICAL]: STATUS_CRITICAL,
};

// ============================================================================
// Props
// ============================================================================

export interface PipelineMapProps {
  world: PipelineWorld;
  selectedPointKey: string | null;
}

function stationLabelWidth(name: string, km: number): number {
  const pkLabel = `pk${formatPk(km)}`;
  return Math.max(
    28,
    name.length * STATION_NAME_CHARACTER_WIDTH +
      LABEL_INLINE_GAP +
      pkLabel.length * PK_CHARACTER_WIDTH,
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * Horizontal SVG pipeline map.
 *
 * SVG sizing: full-width recipe (ADR-7 thin-map exception).
 *   style={{ display:'block', aspectRatio:`${VB_WIDTH} / ${VB_HEIGHT}` }}
 *   className="block w-full"
 * No maxWidth cap — the 1080×80 strip is too thin for the cap to matter; at
 * 1900px it only grows ~50px in height, which is acceptable. The cap is kept
 * for tall diagrams (FlowDiagram 1080×320) but removed here to fill the panel.
 * NO fixed px height, NO Recharts ResponsiveContainer (that is for TimeSeriesChart only, ADR-7).
 */
export function PipelineMap({ world, selectedPointKey }: PipelineMapProps) {
  const selectEntity = useSelectionStore((s) => s.selectEntity);

  // WARNING-4: wrap all derived values in useMemo so they don't rebuild new refs on every render.
  // React Compiler is NOT enabled (next.config.ts is bare), so manual memoization is required.

  // Group cathodic readings — needed for km range too (SUGGESTION-2)
  const cathodicGroups = useMemo(
    () => groupReadingsByKm(world.cathodicReadings),
    [world.cathodicReadings],
  );

  // Build cathodic marker data: one per unique point key
  const cathodicMarkers = useMemo(
    () =>
      Array.from(cathodicGroups.entries()).map(([key, readings]) => {
        // Sort ascending by takenAt, take last = latest
        const sorted = [...readings].sort((a, b) =>
          a.takenAt.localeCompare(b.takenAt),
        );
        const latest = sorted[sorted.length - 1];
        const km = latest.km;
        const level = latest.level as AlertLevel;
        return { key, km, level };
      }),
    [cathodicGroups],
  );

  // SUGGESTION-2: include cathodic km values in the range so cathodic points
  // outside the station span don't extrapolate off-canvas.
  const { minKm, maxKm } = useMemo(() => {
    const stationKms = world.stations.map((s) => s.km);
    const cathodicKms = cathodicMarkers.map((m) => m.km);
    const allKms = [...stationKms, ...cathodicKms];
    return {
      minKm: allKms.length > 0 ? Math.min(...allKms) : 0,
      maxKm: allKms.length > 0 ? Math.max(...allKms) : 270,
    };
  }, [world.stations, cathodicMarkers]);

  const toX = useCallback(
    (km: number) => kmToX(km, minKm, maxKm, VB_WIDTH, PADDING),
    [minKm, maxKm],
  );

  // Build station id → km lookup for rectifier positioning (ADR-4)
  const stationKmById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of world.stations) {
      map[s.id] = s.km;
    }
    return map;
  }, [world.stations]);

  // Rectifiers — from world.equipment where type === RECTIFIER
  const rectifiers = useMemo(
    () => world.equipment.filter((eq) => eq.type === EquipmentType.RECTIFIER),
    [world.equipment],
  );

  // Handle rectifier overlap: group rectifiers by station km, assign ±8px offsets
  const rectByStationKm: Record<string, typeof rectifiers> = {};
  for (const eq of rectifiers) {
    const stKm = stationKmById[eq.stationId];
    if (stKm === undefined) continue;
    const kmKey = String(stKm);
    if (!rectByStationKm[kmKey]) rectByStationKm[kmKey] = [];
    rectByStationKm[kmKey].push(eq);
  }

  // Group rectifiers per station: diamond markers fan out ±8px, but the LABEL is
  // rendered ONCE per group to avoid collisions. A "REC-xxxx" tag (~30px wide) at
  // an 8px marker offset overlaps its neighbour, so multi-rectifier stations show
  // a count badge (×N) instead of stacked tags; single rectifiers keep their tag.
  const rectifierGroups: Array<{
    markers: Array<{ eq: (typeof rectifiers)[number]; x: number }>;
    labelX: number;
    label: string;
  }> = [];
  for (const [, group] of Object.entries(rectByStationKm)) {
    const stKm = stationKmById[group[0].stationId];
    const baseX = toX(stKm);
    const markers = group.map((eq, i) => {
      // Offset: first at 0, then alternate ±8, ±16...
      const offsetIndex = Math.floor((i + 1) / 2);
      const sign = i % 2 === 0 ? -1 : 1;
      const offset = i === 0 ? 0 : sign * offsetIndex * 8;
      return { eq, x: baseX + offset };
    });
    rectifierGroups.push({
      markers,
      labelX: baseX,
      label: group.length === 1 ? group[0].tag : `×${group.length}`,
    });
  }

  const stationLabelPlacements = allocateAnchorAwareLanes(
        world.stations.map((station) => ({
          id: station.id,
          x: toX(station.km),
          width: stationLabelWidth(station.name, station.km),
        })),
        { left: PADDING, right: VB_WIDTH - PADDING },
      );
      const stationLabelById = new Map(
        stationLabelPlacements.map((placement) => [placement.id, placement]),
      );
      const rectifierLabelPlacements = allocateAnchorAwareLanes(
        rectifierGroups.map((group) => ({
          id: group.markers[0].eq.id,
          x: group.labelX,
          width: Math.max(18, group.label.length * 5),
        })),
        { left: PADDING, right: VB_WIDTH - PADDING },
      );
      const rectifierLabelById = new Map(
        rectifierLabelPlacements.map((placement) => [placement.id, placement]),
      );
      const rectifierLaneCount = Math.max(
        1,
        ...rectifierLabelPlacements.map((placement) => placement.lane + 1),
      );
      const stationLaneCount = Math.max(
        1,
        ...stationLabelPlacements.map((placement) => placement.lane + 1),
      );
      const baselineY = TOP_LABEL_Y + rectifierLaneCount * LABEL_LANE_HEIGHT + LABEL_TO_BASELINE_GAP;
      const stationLabelY = baselineY + BASELINE_TO_LABEL_GAP;
      const viewHeight = stationLabelY + stationLaneCount * LABEL_LANE_HEIGHT + SVG_BOTTOM_SPACE;

      return (
        <InstrumentBezel
      label="MAPA DE INTEGRIDAD"
      sublabel="PROTECCIÓN CATÓDICA"
    >
      <div className="p-3" role="region" aria-label="Mapa de integridad catódica">
      {/* SVG: full-width recipe for thin horizontal maps (ADR-7 exception).
          PipelineMap is a thin strip (1080×80, ~13.5:1 ratio). Unlike the
          tall FlowDiagram (1080×320), stretching this to full container width
          only increases height by ~50px at 1900px viewport — acceptable and
          desired. maxWidth cap removed so markers span the full panel width
          with no dead side space. FlowDiagram and PkRuler keep their caps.
          overflow-x-auto + min-w on mobile keeps SVG legible at 375px (B-7) */}
      <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-labelledby="pipeline-map-svg-title"
        className="block w-full min-w-[640px] md:min-w-0"
        style={{
          display: "block",
          aspectRatio: `${VB_WIDTH} / ${viewHeight}`,
          minHeight: "70px",
        }}
      >
        <title id="pipeline-map-svg-title">Mapa de integridad catódica</title>
            {/* Baseline */}
        <line
          x1={PADDING}
          y1={baselineY}
          x2={VB_WIDTH - PADDING}
          y2={baselineY}
          stroke={INK_TERTIARY}
          strokeWidth={1}
          opacity={0.4}
        />

        {/* Station markers — rect 8×12, label below at y=68 */}
        {world.stations.map((station) => {
          const placement = stationLabelById.get(station.id);
              if (!placement) return null;
              const x = placement.x;
          return (
            <g key={station.id}>
              <rect
                x={x - 4}
                y={baselineY - 6}
                width={8}
                height={12}
                fill={INK_TERTIARY}
                opacity={0.7}
              />
              <text
                x={x}
                y={stationLabelY + placement.lane * LABEL_LANE_HEIGHT}
                textAnchor={placement.textAnchor}
                fontSize={8}
                fontFamily={CHART_FONT_MONO}
                fill={INK_TERTIARY}
              >
                <>
                      {station.name}
                      <tspan dx={LABEL_INLINE_GAP} fontSize={6.5} fill={INK_TERTIARY} opacity={0.7}>
                        pk{formatPk(station.km)}
                      </tspan>
                    </>
              </text>
            </g>
          );
        })}

        {/* Rectifier markers — rotated squares (diamonds) fan out per station;
            one label per group (tag if single, ×N badge if clustered). */}
        {rectifierGroups.map((g) => {
              const placement = rectifierLabelById.get(g.markers[0].eq.id);
              if (!placement) return null;
              return (
          <g key={g.markers[0].eq.id}>
            {g.markers.map(({ eq, x }) => (
              <rect
                key={eq.id}
                x={x - 4}
                y={baselineY - 4}
                width={8}
                height={8}
                fill={AMBER_SAFETY}
                opacity={0.85}
                transform={`rotate(45, ${x}, ${baselineY})`}
              />
            ))}
            <text
              x={placement.x}
              y={TOP_LABEL_Y + placement.lane * LABEL_LANE_HEIGHT}
              textAnchor={placement.textAnchor}
              fontSize={7}
              fontFamily={CHART_FONT_MONO}
              fill={AMBER_SAFETY}
              opacity={0.9}
            >
              {g.label}
            </text>
          </g>
              );
            })}

            {/* Cathodic point markers — circle r=6, clickable */}
        {cathodicMarkers.map((marker) => {
          const x = toX(marker.km);
          const isActive = selectedPointKey === marker.key;
          const fill = LEVEL_COLOR[marker.level] ?? STATUS_WARNING;

          return (
            <g
              key={marker.key}
              role="button"
              tabIndex={0}
              aria-label={`Cathodic point km ${marker.km} (${marker.level})`}
              style={{ cursor: "pointer" }}
              onClick={() =>
                selectEntity(marker.key, EntityType.CATHODIC_POINT)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectEntity(marker.key, EntityType.CATHODIC_POINT);
                }
              }}
            >
              <circle
                cx={x}
                cy={baselineY}
                r={6}
                fill={fill}
                stroke={isActive ? "#ffffff" : "none"}
                strokeWidth={isActive ? 2 : 0}
                opacity={0.9}
              />
            </g>
          );
        })}
      </svg>
      </div>
      </div>

      {/* Concept legend strip — HTML context, supports interactive components */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-2 pt-1"
        style={{
          borderTop: "1px solid var(--mc-hairline)",
          fontFamily: "var(--font-mono), monospace",
          fontSize: "9px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-tertiary)",
        }}
      >
        <span className="flex items-center gap-1">
          Rectificador
          <ConceptInfo term="rectificador" label="Rectificador" />
        </span>
        <span className="flex items-center gap-1">
          Punto catódico
          <ConceptInfo term="punto-catodico" label="Punto catódico" />
        </span>
        <span className="flex items-center gap-1">
          Progresiva (km)
          <ConceptInfo term="progresiva" label="Progresiva" />
        </span>
      </div>
    </InstrumentBezel>
  );
}
