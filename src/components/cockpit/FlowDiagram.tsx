"use client";

/**
 * FlowDiagram — SVG cockpit flow diagram (Phase 3 redesign).
 * SR-005: data-derived layout (station.km → x), edges from movement patterns,
 *          pipe CSS stroke-dashoffset animation, SVG animateMotion dots, active-flows-only animation.
 * SR-014: per-tank selectTankLevel selectors — NO coarse tankLevels subscription.
 *
 * Structure:
 *   Part 1 — Pipe SVG (stations + directional two-lane pipes, no tank foreignObjects).
 *   Part 2 — Station-grouped tank card section (HTML, below the SVG).
 */

import { useMemo, memo, useCallback, useState, useEffect, useRef } from "react";
import type { PipelineWorld, Tank, Station } from "@/lib/domain";
import { useSimulationStore, selectTankLevel, useActiveFlows } from "@/store/simulationStore";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import {
  allocateAnchorAwareLanes,
  buildEdges,
  buildStationLayout,
  flowRateToAnimDur,
} from "@/lib/diagrams/layout";
import type { AnchorAwareLanePlacement, NodePosition } from "@/lib/diagrams/layout";
import { formatPk } from "@/lib/format";
import { TankGauge } from "./TankGauge";

// ============================================================================
// CONSTANTS
// ============================================================================

const VIEW_W = 1080;
const PADDING = 60;
const LABEL_Y_TOP = 18;
const LABEL_LANE_HEIGHT = 14;
const LABEL_TO_TRACK_GAP = 16;
const SVG_BOTTOM_SPACE = 40;
const STATION_NAME_CHARACTER_WIDTH = 5.2;
const PK_CHARACTER_WIDTH = 4.5;
const LABEL_INLINE_GAP = 4;
// Directional lane offsets from baseline — downstream above, upstream below.
const DOWNSTREAM_OFFSET = -7;
const UPSTREAM_OFFSET = 7;
// Rendered width cap — fills 1600px panel without letterboxing on ultra-wide.
const VIEW_MAX_W = 1480;

// ============================================================================
// TYPES
// ============================================================================

interface FlowDiagramProps {
  world: PipelineWorld;
}

function stationLabelWidth(station: Station): number {
  const pkLabel = `pk${formatPk(station.km)}`;
  return Math.max(
    28,
    station.name.length * STATION_NAME_CHARACTER_WIDTH +
      LABEL_INLINE_GAP +
      pkLabel.length * PK_CHARACTER_WIDTH,
  );
}

// ============================================================================
// STATION NODE
// ============================================================================

interface StationNodeProps {
  station: Station;
  placement: AnchorAwareLanePlacement;
  stationY: number;
  isSelected: boolean;
  onClick: (stationId: string) => void;
}

const StationNode = memo(function StationNode({
  station,
  placement,
  stationY,
  isSelected,
  onClick,
}: StationNodeProps) {
  const stationDetail = `Estación ${station.name} · pk ${formatPk(station.km)}`;

  function handleKeyDown(e: React.KeyboardEvent<SVGGElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(station.id);
    }
  }

  return (
    <g
      role="button"
      tabIndex={0}
      onClick={() => onClick(station.id)}
      onKeyDown={handleKeyDown}
      style={{ cursor: "pointer" }}
      className="outline-none focus-visible:[&_circle]:stroke-2"
      aria-label={stationDetail}
    >
      <title>{stationDetail}</title>
      <line
        x1={placement.x}
        y1={stationY - 8}
        x2={placement.x}
        y2={LABEL_Y_TOP + placement.lane * LABEL_LANE_HEIGHT + 4}
        stroke="var(--border-mid)"
        strokeWidth="0.75"
      />
      <circle
        cx={placement.x}
        cy={stationY}
        r={8}
        fill={isSelected ? "var(--amber-safety)" : "var(--surface-raised)"}
        stroke={isSelected ? "var(--amber-safety)" : "var(--border-strong)"}
        strokeWidth="1.5"
      />
      <text
        x={placement.x}
        y={LABEL_Y_TOP + placement.lane * LABEL_LANE_HEIGHT}
        textAnchor={placement.textAnchor}
        fontSize="8"
        fill="var(--ink-secondary)"
        fontFamily="var(--font-mono), monospace"
      >
        {station.name}
        <tspan dx={LABEL_INLINE_GAP} fontSize="6.5" fill="var(--ink-muted)">
          pk{formatPk(station.km)}
        </tspan>
      </text>
    </g>
  );
});

// ============================================================================
// PIPE EDGE — directional, two-lane (downstream / upstream)
// ============================================================================

interface PipeEdgeProps {
  x1: number;
  x2: number;
  trackY: number;
  /** true = downstream (x2 > x1, higher km); false = upstream (x2 < x1). */
  isDownstream: boolean;
  isActive: boolean;
  edgeId: string;
  flowRateM3h?: number;
}

const PipeEdge = memo(function PipeEdge({
  x1,
  x2,
  trackY,
  isDownstream,
  isActive,
  edgeId,
  flowRateM3h = 500,
}: PipeEdgeProps) {
  const laneOffset = isDownstream ? DOWNSTREAM_OFFSET : UPSTREAM_OFFSET;
  const y = trackY + laneOffset;
  // Straight horizontal path for the parallel lanes
  const pathD = `M ${x1} ${y} L ${x2} ${y}`;
  const pathLen = Math.abs(x2 - x1);
  const animDur = flowRateToAnimDur(flowRateM3h);

  // Arrowhead direction: downstream → right, upstream → left
  const arrowX = isDownstream ? x2 - 1 : x2 + 1;
  const arrowSize = 5;
  // Triangle pointing right (downstream) or left (upstream)
  const arrowPoints = isDownstream
    ? `${arrowX},${y - arrowSize / 2} ${arrowX + arrowSize},${y} ${arrowX},${y + arrowSize / 2}`
    : `${arrowX},${y - arrowSize / 2} ${arrowX - arrowSize},${y} ${arrowX},${y + arrowSize / 2}`;

  // Active edge flow color: downstream = telemetry blue, upstream = phosphor green
  const flowColor = isDownstream ? "var(--status-flow)" : "var(--accent)";

  const dashLen = pathLen * 0.15;
  const gapLen = pathLen * 0.85;

  return (
    <g>
      {/* Lane pipe track (thinner than main baseline) */}
      <path d={pathD} fill="none" stroke="var(--border-mid)" strokeWidth="1.5" />

      {/* Active flow overlay */}
      {isActive && (
        <>
          <path
            id={`pipe-path-${edgeId}`}
            d={pathD}
            fill="none"
            stroke={flowColor}
            strokeWidth="2"
            strokeDasharray={`${dashLen} ${gapLen}`}
            style={{
              animation: `flow-dash ${animDur}s linear infinite`,
            }}
          />
          {/* Directional arrowhead at destination end */}
          <polygon points={arrowPoints} fill={flowColor} opacity="0.85" />
          {/* Animated dot along the path */}
          <circle r="3" fill={flowColor} opacity="0.8">
            <animateMotion dur={`${animDur}s`} repeatCount="indefinite" path={pathD} />
          </circle>
        </>
      )}
    </g>
  );
});

// ============================================================================
// TANK CARD — HTML card component, subscribes to its own level
// SR-014: one selector per tank, no coarse subscription.
// ============================================================================

interface TankCardProps {
  tank: Tank;
  isActive: boolean;
  isSelected: boolean;
  inflow: boolean;
  outflow: boolean;
  onClick: (tankId: string) => void;
}

const TankCard = memo(function TankCard({
  tank,
  isActive,
  isSelected,
  inflow,
  outflow,
  onClick,
}: TankCardProps) {
  // Per-tank fine-grained selector — SR-014 key constraint
  const level = useSimulationStore(selectTankLevel(tank.id));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(tank.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(tank.id);
        }
      }}
      style={{
        outline: isSelected ? "1px solid var(--amber-safety)" : "none",
        opacity: isActive ? 1 : 0.55,
        transition: "opacity 0.3s",
        cursor: "pointer",
      }}
      aria-label={`Tanque ${tank.tag}`}
    >
      <TankGauge
        tankId={tank.id}
        level={level}
        capacity={tank.capacityM3}
        label={tank.tag}
        temperatureF={tank.temperatureF}
        apiGravity={tank.apiGravity}
        inflow={inflow}
        outflow={outflow}
      />
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * FlowDiagram renders the cockpit's live pipeline topology in two parts:
 *
 * Part 1 — Pipe SVG (stations + directional two-lane pipe edges).
 *   - Downstream flows routed above baseline (telemetry blue).
 *   - Upstream flows routed below baseline (phosphor green).
 *   - No tank foreignObjects in SVG.
 *
 * Part 2 — Station-grouped tank cards (HTML below the SVG).
 *   - Stations sorted by km ascending; each station column contains its tanks.
 *   - Each TankCard subscribes per-tank (SR-014).
 *
 * Clicking station/tank updates selectionStore.
 */
export function FlowDiagram({ world }: FlowDiagramProps) {
  const activeFlows = useActiveFlows();
  const isRunning = useSimulationStore((state) => state.isRunning);
  const selectEntity = useSelectionStore((state) => state.selectEntity);
  const selectedEntityId = useSelectionStore((state) => state.selectedEntityId);

  // Build station x positions from km values — SR-005 req 2
  const stationLayout = useMemo(
    () => buildStationLayout(world.stations, VIEW_W, PADDING),
    [world.stations],
  );

  // Map stationId → x
  const stationXMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of stationLayout) map[entry.stationId] = entry.x;
    return map;
  }, [stationLayout]);

  const stationLabelPlacements = useMemo(
    () =>
      allocateAnchorAwareLanes(
        world.stations.map((station) => ({
          id: station.id,
          x: stationXMap[station.id] ?? 0,
          width: stationLabelWidth(station),
        })),
        { left: PADDING, right: VIEW_W - PADDING },
      ),
    [world.stations, stationXMap],
  );
  const stationLabelById = new Map(
    stationLabelPlacements.map((placement) => [placement.id, placement]),
  );
  const stationLaneCount = Math.max(
    1,
    ...stationLabelPlacements.map((placement) => placement.lane + 1),
  );
  const pipeTrackY = LABEL_Y_TOP + stationLaneCount * LABEL_LANE_HEIGHT + LABEL_TO_TRACK_GAP;
  const viewHeight = pipeTrackY + SVG_BOTTOM_SPACE;

  // Map stationId → km (for directional classification)
  const stationKmById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of world.stations) map[s.id] = s.km;
    return map;
  }, [world.stations]);

  // Tanks grouped by station
  const tanksByStation = useMemo(() => {
    const map: Record<string, Tank[]> = {};
    for (const tank of world.tanks) {
      if (!map[tank.stationId]) map[tank.stationId] = [];
      map[tank.stationId].push(tank);
    }
    return map;
  }, [world.tanks]);

  // Station node positions (for buildEdges)
  const nodePositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    for (const station of world.stations) {
      positions[station.id] = { x: stationXMap[station.id] ?? 0, y: pipeTrackY };
    }
    return positions;
  }, [world.stations, stationXMap, pipeTrackY]);

  // Active flow node IDs — for tank/station opacity control
  const activeNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of activeFlows) {
      ids.add(f.fromNodeId);
      ids.add(f.toNodeId);
    }
    return ids;
  }, [activeFlows]);

  // Unique edges from movements — station-level only (pipe topology)
  const allEdges = useMemo(() => {
    const allFlowLike = world.movements.map((m) => ({
      fromNodeId: m.fromNodeId,
      toNodeId: m.toNodeId,
      flowRateM3h: 500,
    }));
    return buildEdges(allFlowLike, nodePositions);
  }, [world.movements, nodePositions]);

  // Active edge keys for animation check
  const activeEdgeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of activeFlows) keys.add(`${f.fromNodeId}→${f.toNodeId}`);
    return keys;
  }, [activeFlows]);

  // Raw per-tick resolution of which tanks are discharging (fromTankId) /
  // receiving (toTankId) fuel. Gated on isRunning. #3.
  const rawFlowDirs = useMemo(() => {
    const inflow = new Set<string>();
    const outflow = new Set<string>();
    if (isRunning) {
      for (const f of activeFlows) {
        if (f.fromTankId) outflow.add(f.fromTankId);
        if (f.toTankId) inflow.add(f.toTankId);
      }
    }
    return { inflow, outflow };
  }, [activeFlows, isRunning]);

  // Throttled snapshot. At high sim speeds the resolved source/destination tanks
  // (highest/lowest level per station) flip every tick, which made the in/out
  // indicators flicker. Sampling on a fixed ~700ms wall-clock interval decouples
  // the indicator from sim speed so it stays calm and readable regardless of 1×–600×.
  const rawFlowDirsRef = useRef(rawFlowDirs);
  rawFlowDirsRef.current = rawFlowDirs;
  const [flowDirs, setFlowDirs] = useState(rawFlowDirs);
  useEffect(() => {
    if (!isRunning) {
      setFlowDirs({ inflow: new Set<string>(), outflow: new Set<string>() });
      return;
    }
    setFlowDirs(rawFlowDirsRef.current);
    const id = setInterval(() => setFlowDirs(rawFlowDirsRef.current), 700);
    return () => clearInterval(id);
  }, [isRunning]);
  const { inflow: inflowTankIds, outflow: outflowTankIds } = flowDirs;

  // Stations sorted by km ascending — for Part 2 column order
  const sortedStations = useMemo(
    () => [...world.stations].sort((a, b) => a.km - b.km),
    [world.stations],
  );

  const handleTankClick = useCallback(
    (tankId: string) => {
      selectEntity(tankId, EntityType.TANK);
    },
    [selectEntity],
  );

  const handleStationClick = useCallback(
    (stationId: string) => {
      selectEntity(stationId, EntityType.STATION);
    },
    [selectEntity],
  );

  return (
    <div
      className="w-full border border-border-mid bg-surface-raised overflow-hidden"
      role="region"
      aria-label="Diagrama de flujo del oleoducto"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <span
          className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Diagrama de Flujo
        </span>
        <span
          className="text-[12px] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {activeFlows.length} flujos activos
        </span>
      </div>

      {/* ── PART 1: Pipe SVG — stations + directional two-lane pipes ── */}
      {/* overflow-x-auto + min-w on mobile keeps SVG legible at 375px (B-6) */}
      <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block w-full min-w-[640px] md:min-w-0"
        style={{
          display: "block",
          aspectRatio: `${VIEW_W} / ${viewHeight}`,
          maxWidth: `${VIEW_MAX_W}px`,
          minHeight: "90px",
        }}
        role="group"
          aria-labelledby="flow-diagram-svg-title"
      >
        <title id="flow-diagram-svg-title">Diagrama de flujo del oleoducto</title>
            {/* Static pipe baseline (center track) */}
        <line
          x1={PADDING}
          y1={pipeTrackY}
          x2={VIEW_W - PADDING}
          y2={pipeTrackY}
          stroke="var(--border-mid)"
          strokeWidth="2.5"
        />

        {/* Pipe edges — directional lanes */}
        {allEdges.map((edge) => {
          const edgeKey = `${edge.fromNodeId}→${edge.toNodeId}`;
          const isActive = activeEdgeKeys.has(edgeKey);
          const fromKm = stationKmById[edge.fromNodeId] ?? 0;
          const toKm = stationKmById[edge.toNodeId] ?? 0;
          const isDownstream = toKm >= fromKm;
          return (
            <PipeEdge
              key={edgeKey}
              x1={edge.x1}
              x2={edge.x2}
              trackY={pipeTrackY}
                  isDownstream={isDownstream}
              isActive={isActive}
              edgeId={edgeKey.replace(/[^a-zA-Z0-9]/g, "-")}
            />
          );
        })}

        {/* Station nodes */}
        {world.stations.map((station) => {
          const placement = stationLabelById.get(station.id);
              if (!placement) return null;
          return (
            <StationNode
              key={station.id}
              station={station}
              placement={placement}
                  stationY={pipeTrackY}
              isSelected={selectedEntityId === station.id}
              onClick={handleStationClick}
            />
          );
        })}
      </svg>
      </div>

      {/* ── PART 2: Station-grouped tank cards (HTML) ── */}
      <div className="flex flex-wrap gap-3 px-4 pb-4 pt-3">
        {sortedStations.map((station) => {
          const tanks = tanksByStation[station.id] ?? [];
          if (tanks.length === 0) return null;
          const stationIsActive = activeNodeIds.has(station.id);
          return (
            <div key={station.id} className="flex-1 min-w-[200px] flex flex-col gap-2">
              {/* Station group header */}
              <div
                className="border-b border-border-subtle pb-1 text-[12px] uppercase text-ink-tertiary"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                {station.name}
                <span className="text-ink-muted"> · pk{formatPk(station.km)}</span>
              </div>
              {/* Tank cards */}
              {tanks.map((tank) => (
                <TankCard
                  key={tank.id}
                  tank={tank}
                  isActive={stationIsActive}
                  isSelected={selectedEntityId === tank.id}
                  inflow={inflowTankIds.has(tank.id)}
                  outflow={outflowTankIds.has(tank.id)}
                  onClick={handleTankClick}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
