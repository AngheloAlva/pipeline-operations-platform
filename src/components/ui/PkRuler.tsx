"use client";

import type { Pipeline, Station } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// PkRuler props
// ---------------------------------------------------------------------------

interface PkRulerProps {
  pipeline: Pipeline;
  stations: Station[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const RULER_HEIGHT = 52; // total component height in px (SVG viewBox units)
const TRACK_Y = 26; // vertical center of the pipe track
const TRACK_THICKNESS = 3; // pipe track stroke width
const MAJOR_TICK_H = 10; // major tick height (every 50 km)
const MINOR_TICK_H = 5; // minor tick height (every 10 km)
const STATION_DOT_R = 5; // station dot radius
const LABEL_Y_TOP = 10; // station label y (above track)
const KM_LABEL_Y = RULER_HEIGHT - 2; // km label y (below track)

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
export function PkRuler({ pipeline, stations, className }: PkRulerProps) {
  const { totalLengthKm, segments } = pipeline;

  // Sort stations by km
  const sorted = [...stations].sort((a, b) => a.km - b.km);

  // We render at 100% width — use a viewBox so SVG scales.
  // ViewBox width = totalLengthKm * 4 for reasonable resolution, then scale with preserveAspectRatio.
  const vbWidth = 1080; // fixed logical width for the viewBox
  const vbHeight = RULER_HEIGHT;

  function xOf(km: number): number {
    return (km / totalLengthKm) * vbWidth;
  }

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
      role="img"
      aria-label={`Progresiva del oleoducto — ${totalLengthKm} km total`}
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
          La Progresiva — pk 0 → pk {totalLengthKm}
        </span>
        <span
          className="text-[10px] text-ink-muted"
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
        className="mx-auto block w-full"
        style={{
          display: "block",
          aspectRatio: `${vbWidth} / ${vbHeight}`,
          maxWidth: `${vbWidth}px`,
        }}
        aria-hidden="true"
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
          y1={TRACK_Y}
          x2={vbWidth}
          y2={TRACK_Y}
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
              y1={TRACK_Y - halfH}
              x2={x}
              y2={TRACK_Y + halfH}
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
              y={KM_LABEL_Y}
              textAnchor="middle"
              fontSize="7"
              fill="var(--ink-muted)"
              fontFamily="var(--font-mono), monospace"
            >
              {km}
            </text>
          ))}

        {/* Station dots + labels */}
        {sorted.map((station) => {
          const x = xOf(station.km);
          const isTerminalOrSource = station.kind === "SOURCE" || station.kind === "TERMINAL";

          return (
            <g key={station.id}>
              {/* Vertical connector from label to dot */}
              <line
                x1={x}
                y1={TRACK_Y - STATION_DOT_R}
                x2={x}
                y2={LABEL_Y_TOP + 8}
                stroke="var(--border-mid)"
                strokeWidth="0.75"
              />

              {/* Station dot — phosphor for terminal/source, border-strong for pump */}
              <circle
                cx={x}
                cy={TRACK_Y}
                r={STATION_DOT_R}
                fill={isTerminalOrSource ? "var(--phosphor)" : "var(--surface-raised)"}
                stroke={isTerminalOrSource ? "var(--phosphor)" : "var(--border-strong)"}
                strokeWidth="1.5"
              />

              {/* Station name */}
              <text
                x={x}
                y={LABEL_Y_TOP}
                textAnchor="middle"
                fontSize="7.5"
                fill="var(--ink-secondary)"
                fontFamily="var(--font-mono), monospace"
                fontWeight="500"
              >
                {station.name}
              </text>

              {/* PK value below name */}
              <text
                x={x}
                y={LABEL_Y_TOP + 8}
                textAnchor="middle"
                fontSize="6.5"
                fill="var(--ink-muted)"
                fontFamily="var(--font-mono), monospace"
              >
                pk{station.km.toFixed(0)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
