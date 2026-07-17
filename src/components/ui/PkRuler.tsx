"use client";

import type { Pipeline, Station } from "@/lib/domain/types";
import { allocateAnchorAwareLanes, kmToX, SvgTextAnchor } from "@/lib/diagrams/layout";
import { formatPk } from "@/lib/format";

// ---------------------------------------------------------------------------
// PkRuler props
// ---------------------------------------------------------------------------

export const StationLabelLayout = {
  COMPACT: "compact",
  COLLISION_FREE: "collision-free",
} as const;

export const StationLabelTextAnchor = SvgTextAnchor;

type StationLabelLayout = (typeof StationLabelLayout)[keyof typeof StationLabelLayout];
type StationLabelTextAnchor = (typeof StationLabelTextAnchor)[keyof typeof StationLabelTextAnchor];

interface PkRulerProps {
  pipeline: Pipeline;
  stations: Station[];
  /** Opt into lane allocation where dense station labels would otherwise overlap. */
  stationLabelLayout?: StationLabelLayout;
  className?: string;
}

export interface StationLabelPlacement {
  stationId: string;
  lane: number;
  x: number;
  textAnchor: StationLabelTextAnchor;
  left: number;
  right: number;
}

interface StationLabelBounds {
  left: number;
  right: number;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const RULER_BOTTOM_SPACE = 26; // track-to-bottom space, including km labels
const H_PADDING = 55; // horizontal inset so km 0 / km max station labels never clip
const TRACK_Y = 38; // compact-layout vertical center of the pipe track
const TRACK_THICKNESS = 3; // pipe track stroke width
const MAJOR_TICK_H = 12; // major tick height (every 50 km)
const MINOR_TICK_H = 6; // minor tick height (every 10 km)
const STATION_DOT_R = 5.5; // station dot radius
const LABEL_Y_TOP = 13; // first station-label baseline above track
const LABEL_LANE_HEIGHT = 13; // single-line label height plus breathing room
const LABEL_TO_TRACK_GAP = 5; // gap from the final label lane to the track
const LABEL_CHARACTER_WIDTH = 5.8; // 9.5px monospace station-name width estimate in SVG units
const PK_CHARACTER_WIDTH = 4.5; // 7.5px monospace PK width estimate in SVG units
const LABEL_INLINE_GAP = 4; // space between station name and muted PK value
const LABEL_HORIZONTAL_GUTTER = 8; // prevents labels in one lane from touching

/**
 * Allocate station labels to the first lane with enough horizontal space.
 *
 * The output is pure and data-derived: labels in the same lane have disjoint
 * intervals, while every station remains represented by its marker and label.
 */
export function buildCollisionFreeStationLabels(
  stations: readonly Station[],
  xOf: (km: number) => number,
  bounds?: StationLabelBounds,
): StationLabelPlacement[] {
  return allocateAnchorAwareLanes(
    stations.map((station) => {
      const pkLabel = `pk${formatPk(station.km)}`;
      return {
        id: station.id,
        x: xOf(station.km),
        width: Math.max(
          20,
          station.name.length * LABEL_CHARACTER_WIDTH +
            LABEL_INLINE_GAP +
            pkLabel.length * PK_CHARACTER_WIDTH,
        ),
      };
    }),
    bounds,
    LABEL_HORIZONTAL_GUTTER,
  ).map((placement) => ({
    stationId: placement.id,
    lane: placement.lane,
    x: placement.x,
    textAnchor: placement.textAnchor,
    left: placement.left,
    right: placement.right,
  }));
}

/**
 * PkRuler — "La progresiva"
 *
 * A full-width horizontal PK ruler strip rendering the pipeline from 0 → totalLengthKm.
 * Tick marks, km labels, and station positions with node-kind callouts.
 * Pure SVG, no external dependencies.
 *
 * This is the product's visual signature: the same element appears across all
 * three modules (overview, cockpit, maintenance/integrity) to orient the operator.
 */
export function PkRuler({
  pipeline,
  stations,
  stationLabelLayout = StationLabelLayout.COMPACT,
  className,
}: PkRulerProps) {
  const { totalLengthKm, segments } = pipeline;

  // Sort stations by km
  const sorted = [...stations].sort((a, b) => a.km - b.km);

  // We render at 100% width — use a viewBox so SVG scales.
  // ViewBox width = totalLengthKm * 4 for reasonable resolution, then scale with preserveAspectRatio.
  const vbWidth = 1080; // fixed logical width for the viewBox

  // Shared km→x mapping (same helper FlowDiagram/PipelineMap use) so the ruler
  // stays in lockstep with the rest of the diagrams. minKm=0, padding=H_PADDING.
  const xOf = (km: number) => kmToX(km, 0, totalLengthKm, vbWidth, H_PADDING);
  const collisionFree = stationLabelLayout === StationLabelLayout.COLLISION_FREE;
  const labelPlacements = collisionFree
    ? buildCollisionFreeStationLabels(sorted, xOf, { left: 0, right: vbWidth })
    : [];
  const placementByStationId = new Map(
    labelPlacements.map((placement) => [placement.stationId, placement]),
  );
  const laneCount = collisionFree
    ? Math.max(1, ...labelPlacements.map((placement) => placement.lane + 1))
    : 1;
  const trackY = collisionFree
    ? LABEL_Y_TOP + laneCount * LABEL_LANE_HEIGHT + LABEL_TO_TRACK_GAP
    : TRACK_Y;
  const vbHeight = trackY + RULER_BOTTOM_SPACE;
  const kmLabelY = vbHeight - 4;

  // Tick generation
  const ticks: { km: number; major: boolean }[] = [];
  for (let k = 0; k <= totalLengthKm; k += 10) {
    ticks.push({ km: k, major: k % 50 === 0 });
  }

  // Segment fill colors — subtle tint to show terrain zones
  const segmentTints = [
    "rgba(74, 222, 128, 0.04)", // SEG-1: plains
    "rgba(248, 113, 113, 0.05)", // SEG-2: alta montaña (slight red-tint, higher risk)
    "rgba(74, 222, 128, 0.04)", // SEG-3: descent
  ];

  return (
    <div
      className={`w-full border border-border-mid bg-surface-raised overflow-hidden ${className ?? ""}`}
      role={collisionFree ? undefined : "img"}
      aria-label={`Progresiva del oleoducto — ${totalLengthKm} km total`}
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
        <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
          La Progresiva — pk 0 → pk {totalLengthKm}
        </span>
        <span
          className="text-[12px] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {pipeline.name} · ∅{pipeline.diameterInches}&quot; · {sorted.length} estaciones
        </span>
      </div>

      {/* SVG ruler — constrained to max-w-[1080px] + mx-auto to eliminate dead side
          space at viewports wider than the viewBox. aspect-ratio governs height.
          At 2000px the ruler is 1080px wide (centered) with no letterboxing. */}
      <svg
        viewBox={`0 0 ${vbWidth} ${vbHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full"
        style={{
          display: "block",
          aspectRatio: `${vbWidth} / ${vbHeight}`,
        }}
        role={collisionFree ? "group" : undefined}
        aria-label={
          collisionFree ? `Progresiva del oleoducto — ${totalLengthKm} km total` : undefined
        }
      >
        {/* Segment tints */}
        {segments.map((seg, i) => (
          <rect
            key={seg.id}
            x={xOf(seg.fromKm)}
            y={0}
            width={xOf(seg.toKm) - xOf(seg.fromKm)}
            height={vbHeight}
            fill={segmentTints[i % segmentTints.length]}
          />
        ))}

        {/* Segment boundary lines */}
        {segments.slice(0, -1).map((seg) => (
          <line
            key={`boundary-${seg.id}`}
            x1={xOf(seg.toKm)}
            y1={0}
            x2={xOf(seg.toKm)}
            y2={vbHeight}
            stroke="rgba(200, 208, 220, 0.12)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        ))}

        {/* Pipe track — the main horizontal pipe line */}
        <line
          x1={0}
          y1={trackY}
          x2={vbWidth}
          y2={trackY}
          stroke="var(--border-strong)"
          strokeWidth={TRACK_THICKNESS}
          strokeLinecap="square"
        />

        {/* Tick marks */}
        {ticks.map(({ km, major }) => {
          const x = xOf(km);
          const halfH = major ? MAJOR_TICK_H / 2 : MINOR_TICK_H / 2;
          return (
            <line
              key={`tick-${km}`}
              x1={x}
              y1={trackY - halfH}
              x2={x}
              y2={trackY + halfH}
              stroke={major ? "var(--border-strong)" : "var(--border-mid)"}
              strokeWidth={major ? 1.5 : 0.75}
            />
          );
        })}

        {/* KM labels for major ticks */}
        {ticks
          .filter((t) => t.major)
          .map(({ km }) => (
            <text
              key={`label-${km}`}
              x={xOf(km)}
              y={kmLabelY}
              textAnchor="middle"
              fontSize="8.5"
              fill="var(--ink-muted)"
              fontFamily="var(--font-mono), monospace"
            >
              {km}
            </text>
          ))}

        {/* Station dots + labels */}
        {sorted.map((station) => {
          const x = xOf(station.km);
          const placement = placementByStationId.get(station.id);
          const labelY = collisionFree
            ? LABEL_Y_TOP + (placement?.lane ?? 0) * LABEL_LANE_HEIGHT
            : LABEL_Y_TOP;
          const labelX = placement?.x ?? x;
          const labelTextAnchor = placement?.textAnchor ?? StationLabelTextAnchor.MIDDLE;
          const stationDetail = `${station.name} · pk ${formatPk(station.km)}`;
          const isTerminalOrSource = station.kind === "SOURCE" || station.kind === "TERMINAL";

          return (
            <g
              key={station.id}
              role={collisionFree ? "group" : undefined}
              aria-label={collisionFree ? stationDetail : undefined}
              tabIndex={collisionFree ? 0 : undefined}
              className={
                collisionFree ? "outline-none focus-visible:[&_circle]:stroke-2" : undefined
              }
            >
              {collisionFree ? <title>{stationDetail}</title> : null}
              {/* Vertical connector from label to dot */}
              <line
                x1={x}
                y1={trackY - STATION_DOT_R}
                x2={x}
                y2={collisionFree ? labelY + 4 : labelY + 14}
                stroke="var(--border-mid)"
                strokeWidth="0.75"
              />

              {/* Station dot — cyan identity accent marks terminal/source endpoints
                  (structural, not a status); pump stations stay hollow/neutral.
                  Green/amber/red are reserved strictly for semantic status. */}
              <circle
                cx={x}
                cy={trackY}
                r={STATION_DOT_R}
                fill={isTerminalOrSource ? "var(--accent)" : "var(--surface-raised)"}
                stroke={isTerminalOrSource ? "var(--accent)" : "var(--border-strong)"}
                strokeWidth="1.5"
              />

              {/* Station name */}
              <text
                x={labelX}
                y={labelY}
                textAnchor={labelTextAnchor}
                fontSize="9.5"
                fill="var(--ink-secondary)"
                fontFamily="var(--font-mono), monospace"
                fontWeight="500"
              >
                {collisionFree ? (
                  <>
                    {station.name}
                    <tspan
                      dx={LABEL_INLINE_GAP}
                      fontSize="7.5"
                      fill="var(--ink-muted)"
                      fontWeight="400"
                    >
                      pk{formatPk(station.km)}
                    </tspan>
                  </>
                ) : (
                  station.name
                )}
              </text>

              {/* PK value below name in compact mode */}
              <text
                x={x}
                y={labelY + 10}
                display={collisionFree ? "none" : undefined}
                textAnchor="middle"
                fontSize="7.5"
                fill="var(--ink-muted)"
                fontFamily="var(--font-mono), monospace"
              >
                pk{formatPk(station.km)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
