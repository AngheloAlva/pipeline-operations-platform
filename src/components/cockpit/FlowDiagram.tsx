"use client";

/**
 * FlowDiagram — SVG cockpit flow diagram.
 * SR-005: data-derived layout (station.km → x), edges from movement patterns,
 *          pipe CSS stroke-dashoffset animation, SVG animateMotion dots, active-flows-only animation.
 * SR-014: per-tank selectTankLevel selectors — NO coarse tankLevels subscription.
 */

import { useMemo, memo, useCallback } from "react";
import type { PipelineWorld, Tank, Station } from "@/lib/domain";
import { useSimulationStore, selectTankLevel, useActiveFlows } from "@/store/simulationStore";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import { buildStationLayout, buildEdges, flowRateToAnimDur } from "@/lib/diagrams/layout";
import type { NodePosition } from "@/lib/diagrams/layout";
import { TankGauge } from "./TankGauge";

// ============================================================================
// CONSTANTS
// ============================================================================

const VIEW_W = 1080;
const VIEW_H = 320;
const PADDING = 60;
const STATION_Y = 80;
const TANK_Y_START = 160;
const TANK_Y_STEP = 90;
const PIPE_TRACK_Y = STATION_Y + 8;

// ============================================================================
// TYPES
// ============================================================================

interface FlowDiagramProps {
  world: PipelineWorld;
}

// ============================================================================
// SINGLE TANK NODE — reads its own level via per-tank selector
// SR-014: one selector per tank, no coarse subscription.
// ============================================================================

interface TankNodeProps {
  tank: Tank;
  x: number;
  y: number;
  isActive: boolean;
  isSelected: boolean;
  onClick: (tankId: string) => void;
}

const TankNode = memo(function TankNode({
  tank,
  x,
  y,
  isActive,
  isSelected,
  onClick,
}: TankNodeProps) {
  // Per-tank fine-grained selector — SR-014 key constraint
  const level = useSimulationStore(selectTankLevel(tank.id));

  return (
    <foreignObject
      x={x - 24}
      y={y}
      width={48}
      height={100}
      style={{ cursor: "pointer" }}
      onClick={() => onClick(tank.id)}
      aria-label={`Tanque ${tank.tag}`}
    >
      <div
        style={{
          outline: isSelected ? "1px solid var(--amber-safety)" : "none",
          opacity: isActive ? 1 : 0.55,
          transition: "opacity 0.3s",
        }}
      >
        <TankGauge tankId={tank.id} level={level} capacity={tank.capacityM3} label={tank.tag} />
      </div>
    </foreignObject>
  );
});

// ============================================================================
// STATION NODE
// ============================================================================

interface StationNodeProps {
  station: Station;
  x: number;
  isSelected: boolean;
  onClick: (stationId: string) => void;
}

function StationNode({ station, x, isSelected, onClick }: StationNodeProps) {
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
      aria-label={`Estación ${station.name}`}
    >
      <circle
        cx={x}
        cy={STATION_Y}
        r={8}
        fill={isSelected ? "var(--amber-safety)" : "var(--surface-raised)"}
        stroke={isSelected ? "var(--amber-safety)" : "var(--border-strong)"}
        strokeWidth="1.5"
      />
      <text
        x={x}
        y={STATION_Y - 14}
        textAnchor="middle"
        fontSize="8"
        fill="var(--ink-secondary)"
        fontFamily="var(--font-mono), monospace"
      >
        {station.name}
      </text>
      <text
        x={x}
        y={STATION_Y - 5}
        textAnchor="middle"
        fontSize="6.5"
        fill="var(--ink-muted)"
        fontFamily="var(--font-mono), monospace"
      >
        pk{station.km}
      </text>
    </g>
  );
}

// ============================================================================
// PIPE EDGE — animated or static
// ============================================================================

interface PipeEdgeProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isActive: boolean;
  edgeId: string;
  /** Flow rate in m³/h — drives animateMotion speed (faster flow → shorter dur). */
  flowRateM3h?: number;
}

function PipeEdge({ x1, y1, x2, y2, isActive, edgeId, flowRateM3h = 500 }: PipeEdgeProps) {
  const pathD = `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
  const pathLen = Math.hypot(x2 - x1, y2 - y1) * 1.1; // approx bezier length
  const animDur = flowRateToAnimDur(flowRateM3h);

  return (
    <g>
      {/* Static pipe track */}
      <path d={pathD} fill="none" stroke="var(--border-mid)" strokeWidth="2" />

      {/* Animated flow overlay — only when active */}
      {isActive && (
        <>
          <path
            id={`pipe-path-${edgeId}`}
            d={pathD}
            fill="none"
            stroke="var(--status-flow)"
            strokeWidth="2"
            strokeDasharray={`${pathLen * 0.15} ${pathLen * 0.85}`}
            style={{
              animation: `flow-dash ${animDur}s linear infinite`,
            }}
          />
          {/* Flow dot using animateMotion — dur derived from flow rate */}
          <circle r="3" fill="var(--telemetry-blue)" opacity="0.8">
            <animateMotion dur={`${animDur}s`} repeatCount="indefinite" path={pathD} />
          </circle>
        </>
      )}
    </g>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * FlowDiagram renders the cockpit's live pipeline topology.
 * - Station x positions derived from station.km (SR-005 req 2).
 * - Tank nodes stacked below their parent station.
 * - Pipe edges derived from movement from/to node patterns.
 * - Only tanks with active flows animate (SR-005 req 5).
 * - Per-tank TankNode subscribes to selectTankLevel(id) — SR-014.
 * - Clicking a node updates selectionStore.
 */
export function FlowDiagram({ world }: FlowDiagramProps) {
  const activeFlows = useActiveFlows();
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

  // Tanks grouped by station
  const tanksByStation = useMemo(() => {
    const map: Record<string, Tank[]> = {};
    for (const tank of world.tanks) {
      if (!map[tank.stationId]) map[tank.stationId] = [];
      map[tank.stationId].push(tank);
    }
    return map;
  }, [world.tanks]);

  // Build a node position map for all tanks (for edge routing)
  const nodePositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};

    for (const station of world.stations) {
      const stationX = stationXMap[station.id] ?? 0;
      const tanks = tanksByStation[station.id] ?? [];
      tanks.forEach((tank, idx) => {
        positions[tank.id] = {
          x: stationX,
          y: TANK_Y_START + idx * TANK_Y_STEP + 40, // center of TankGauge
        };
      });
      // Also register station position for station-level edges
      positions[station.id] = { x: stationX, y: STATION_Y };
    }

    return positions;
  }, [world.stations, stationXMap, tanksByStation]);

  // Active flow node IDs — for opacity control
  const activeNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of activeFlows) {
      ids.add(f.fromNodeId);
      ids.add(f.toNodeId);
    }
    return ids;
  }, [activeFlows]);

  // Unique edges from movements (all possible pipe paths)
  const allEdges = useMemo(() => {
    const allFlowLike = world.movements.map((m) => ({
      fromNodeId: m.fromNodeId,
      toNodeId: m.toNodeId,
      flowRateM3h: 500, // placeholder — edge just needs from/to
    }));
    return buildEdges(allFlowLike, nodePositions);
  }, [world.movements, nodePositions]);

  // Active edge keys for animation check
  const activeEdgeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of activeFlows) keys.add(`${f.fromNodeId}→${f.toNodeId}`);
    return keys;
  }, [activeFlows]);

  // useCallback: selectEntity from Zustand is a stable store action reference.
  // Without memoization, new function instances on every render defeat TankNode/StationNode memo.
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
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Diagrama de Flujo
        </span>
        <span
          className="text-[10px] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {activeFlows.length} flujos activos
        </span>
      </div>

      {/* SVG diagram — constrained to max-w-[1080px] + mx-auto so at wide viewports
          the panel never letterboxes with dead side space; aspect-ratio governs height.
          At 2000px the SVG container is 1080px wide (centered) and ~320px tall — no dead space. */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block w-full"
        style={{
          display: "block",
          aspectRatio: `${VIEW_W} / ${VIEW_H}`,
          maxWidth: `${VIEW_W}px`,
        }}
        aria-hidden="true"
      >
        {/* Pipe track baseline */}
        <line
          x1={PADDING}
          y1={PIPE_TRACK_Y}
          x2={VIEW_W - PADDING}
          y2={PIPE_TRACK_Y}
          stroke="var(--border-mid)"
          strokeWidth="2.5"
        />

        {/* Pipe edges (static + animated overlay) */}
        {allEdges.map((edge) => {
          const edgeKey = `${edge.fromNodeId}→${edge.toNodeId}`;
          const isActive = activeEdgeKeys.has(edgeKey);
          return (
            <PipeEdge
              key={edgeKey}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              isActive={isActive}
              edgeId={edgeKey.replace(/[^a-zA-Z0-9]/g, "-")}
            />
          );
        })}

        {/* Station nodes */}
        {world.stations.map((station) => {
          const x = stationXMap[station.id] ?? 0;
          return (
            <StationNode
              key={station.id}
              station={station}
              x={x}
              isSelected={selectedEntityId === station.id}
              onClick={handleStationClick}
            />
          );
        })}

        {/* Tank nodes — each reads its own level via per-tank selector */}
        {world.stations.map((station) => {
          const x = stationXMap[station.id] ?? 0;
          const tanks = tanksByStation[station.id] ?? [];
          // activeNodeIds contains station IDs (fromNodeId/toNodeId from flows).
          // A tank is "active" when its parent station is involved in an active flow.
          const stationIsActive = activeNodeIds.has(station.id);
          return tanks.map((tank, idx) => {
            const tankY = TANK_Y_START + idx * TANK_Y_STEP;
            const isActive = stationIsActive;
            return (
              <TankNode
                key={tank.id}
                tank={tank}
                x={x}
                y={tankY}
                isActive={isActive}
                isSelected={selectedEntityId === tank.id}
                onClick={handleTankClick}
              />
            );
          });
        })}
      </svg>
    </div>
  );
}
