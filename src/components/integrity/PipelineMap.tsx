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

import { useCallback } from "react";
import {
  STATUS_OK,
  STATUS_WARNING,
  STATUS_CRITICAL,
  INK_TERTIARY,
  AMBER_SAFETY,
  CHART_FONT_MONO,
} from "@/lib/charts/palette";
import { kmToX } from "@/lib/diagrams/layout";
import { groupReadingsByKm } from "@/lib/integrity/selectors";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import { AlertLevel, EquipmentType } from "@/lib/domain/types";
import type { PipelineWorld } from "@/lib/domain";

// ============================================================================
// Constants
// ============================================================================

const VB_WIDTH = 1080;
const VB_HEIGHT = 80;
const PADDING = 40;
const BASELINE_Y = 40;

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

// ============================================================================
// Component
// ============================================================================

/**
 * Horizontal SVG pipeline map.
 *
 * SVG sizing uses the phase-1 proven recipe:
 *   style={{ display:'block', aspectRatio:`${VB_WIDTH} / ${VB_HEIGHT}`, maxWidth:`${VB_WIDTH}px` }}
 *   className="mx-auto block w-full"
 * NO fixed px height, NO Recharts ResponsiveContainer (that is for TimeSeriesChart only, ADR-7).
 */
export function PipelineMap({ world, selectedPointKey }: PipelineMapProps) {
  const selectEntity = useSelectionStore((s) => s.selectEntity);

  // Derive km range from stations
  const stationKms = world.stations.map((s) => s.km);
  const minKm = stationKms.length > 0 ? Math.min(...stationKms) : 0;
  const maxKm = stationKms.length > 0 ? Math.max(...stationKms) : 270;

  const toX = useCallback(
    (km: number) => kmToX(km, minKm, maxKm, VB_WIDTH, PADDING),
    [minKm, maxKm],
  );

  // Build station id → km lookup for rectifier positioning (ADR-4)
  const stationKmById: Record<string, number> = {};
  for (const s of world.stations) {
    stationKmById[s.id] = s.km;
  }

  // Rectifiers — from world.equipment where type === RECTIFIER
  const rectifiers = world.equipment.filter(
    (eq) => eq.type === EquipmentType.RECTIFIER,
  );

  // Group cathodic readings by composite key km:segmentId
  const cathodicGroups = groupReadingsByKm(world.cathodicReadings);

  // Build cathodic marker data: one per unique point key
  const cathodicMarkers = Array.from(cathodicGroups.entries()).map(
    ([key, readings]) => {
      // Sort ascending by takenAt, take last = latest
      const sorted = [...readings].sort((a, b) =>
        a.takenAt.localeCompare(b.takenAt),
      );
      const latest = sorted[sorted.length - 1];
      const km = latest.km;
      const level = latest.level as AlertLevel;
      return { key, km, level };
    },
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

  // Flatten rectifiers with offset applied
  const rectifierMarkers: Array<{ eq: (typeof rectifiers)[number]; x: number; yLabel: number }> = [];
  for (const [, group] of Object.entries(rectByStationKm)) {
    const stKm = stationKmById[group[0].stationId];
    const baseX = toX(stKm);
    group.forEach((eq, i) => {
      // Offset: first at 0, then alternate ±8, ±16...
      const offsetIndex = Math.floor((i + 1) / 2);
      const sign = i % 2 === 0 ? -1 : 1;
      const offset = i === 0 ? 0 : sign * offsetIndex * 8;
      rectifierMarkers.push({ eq, x: baseX + offset, yLabel: 20 });
    });
  }

  return (
    <section
      aria-label="Mapa de integridad catódica"
      className="border border-border-mid bg-surface-raised p-3"
    >
      <header className="mb-2 flex items-center justify-between">
        <h2
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Mapa de Integridad — Protección Catódica
        </h2>
      </header>

      {/* SVG: phase-1 aspect-ratio recipe (ADR-7) */}
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Pipeline cathodic integrity map"
        className="mx-auto block w-full"
        style={{
          display: "block",
          aspectRatio: `${VB_WIDTH} / ${VB_HEIGHT}`,
          maxWidth: `${VB_WIDTH}px`,
        }}
      >
        {/* Baseline */}
        <line
          x1={PADDING}
          y1={BASELINE_Y}
          x2={VB_WIDTH - PADDING}
          y2={BASELINE_Y}
          stroke={INK_TERTIARY}
          strokeWidth={1}
          opacity={0.4}
        />

        {/* Station markers — rect 8×12, label below at y=68 */}
        {world.stations.map((station) => {
          const x = toX(station.km);
          return (
            <g key={station.id}>
              <rect
                x={x - 4}
                y={BASELINE_Y - 6}
                width={8}
                height={12}
                fill={INK_TERTIARY}
                opacity={0.7}
              />
              <text
                x={x}
                y={68}
                textAnchor="middle"
                fontSize={8}
                fontFamily={CHART_FONT_MONO}
                fill={INK_TERTIARY}
              >
                {station.name}
              </text>
            </g>
          );
        })}

        {/* Rectifier markers — rotated square 8×8, label at y=20 */}
        {rectifierMarkers.map(({ eq, x, yLabel }) => (
          <g key={eq.id}>
            {/* Rotated square (diamond) via transform="rotate(45, cx, cy)" */}
            <rect
              x={x - 4}
              y={BASELINE_Y - 4}
              width={8}
              height={8}
              fill={AMBER_SAFETY}
              opacity={0.85}
              transform={`rotate(45, ${x}, ${BASELINE_Y})`}
            />
            <text
              x={x}
              y={yLabel}
              textAnchor="middle"
              fontSize={7}
              fontFamily={CHART_FONT_MONO}
              fill={AMBER_SAFETY}
              opacity={0.9}
            >
              {eq.tag}
            </text>
          </g>
        ))}

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
                cy={BASELINE_Y}
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
    </section>
  );
}
