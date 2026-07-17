"use client";

/**
 * CrudeMovementDiagram — the demo hero (MV-13, plan §5).
 *
 * Illustrative crude-movement diagram over the canonical topology
 * (lib/data/canonical.ts) with live data from the simulation stores:
 *   1. Breathes — tank levels + edge animation from simulationStore.
 *   2. Explicit custody jump — 15°C OTA left / 60°F OTC right boundary.
 *   3. Custody-difference chip at the boundary (lib/volumetrics/custody).
 *   4. Clickable nodes → selectEntity (+ ?focus= via useFocusSync on the page).
 *   5. Per-node status via resolveNodeStatus (gray/amber/red/cyan tokens).
 *   6. Design tokens only, dark-first, large type.
 *
 * Complements FlowDiagram (the technical per-km schematic) — does not replace it.
 * Layout is pure data in lib/diagrams/heroLayout.ts (ADR-7 sizing pattern).
 */

import { useMemo, memo, useCallback } from "react";
import Link from "next/link";
import type { PipelineWorld, Station, Tank } from "@/lib/domain";
import { CUSTODY_MANIFOLD_TAG } from "@/lib/data/canonical";
import { resolveNodeStatus, NodeStatus } from "@/lib/domain/nodeStatus";
import { computeCustodyDiff } from "@/lib/volumetrics/custody";
import { MODULE_PATH } from "@/lib/focus/focusUrl";
import { CUSTODY_DIFF_ANCHOR } from "@/components/cockpit/CustodyDiffPanel";
import { useSimulationStore, selectTankLevel, useActiveFlows } from "@/store/simulationStore";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import { flowRateToAnimDur } from "@/lib/diagrams/layout";
import {
  HERO_VIEW,
  HERO_NODES,
  HERO_EDGES,
  HERO_TANK_SLOTS,
  HERO_BOUNDARY,
  HeroNodeRole,
  heroEdgePath,
  heroEdgeLength,
  computeEdgeGroupActivity,
} from "@/lib/diagrams/heroLayout";
import type { HeroNodeSpec, HeroEdgeSpec, HeroTankSlot, HeroFlowTags } from "@/lib/diagrams/heroLayout";
import { TankGauge } from "./TankGauge";

// ============================================================================
// CONSTANTS
// ============================================================================

const VIEW_W = HERO_VIEW.width;
const VIEW_H = HERO_VIEW.height;
/** Rendered width cap — fills the wide cockpit panel without letterboxing. */
const VIEW_MAX_W = 1480;

const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

/**
 * Status → semantic-token mapping, in the plan §5 order
 * OK / PERMIT / LOTO / ALERT → gray / amber / red / cyan.
 */
const STATUS_STYLE: Record<NodeStatus, { ring: string | null; label: string | null }> = {
  [NodeStatus.OK]: { ring: null, label: null },
  [NodeStatus.PERMIT]: { ring: "var(--status-warning)", label: "PERMISO" },
  [NodeStatus.LOTO]: { ring: "var(--status-critical)", label: "LOTO" },
  [NodeStatus.ALERT]: { ring: "var(--status-flow)", label: "ALERTA" },
};

/** Custody-difference tolerance (±% of origin volume) — DOMAIN_RULES §balance. */
const CUSTODY_TOLERANCE_PCT = 0.5;

const M3_FORMAT = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const PCT_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Convert a viewBox coordinate to a CSS percentage of the container. */
function pctX(x: number): string {
  return `${(x / VIEW_W) * 100}%`;
}
function pctY(y: number): string {
  return `${(y / VIEW_H) * 100}%`;
}

// ============================================================================
// HERO EDGE — animated polyline (PipeEdge pattern over waypoints)
// ============================================================================

interface HeroEdgeProps {
  edge: HeroEdgeSpec;
  isActive: boolean;
  flowRateM3h: number;
}

const HeroEdge = memo(function HeroEdge({ edge, isActive, flowRateM3h }: HeroEdgeProps) {
  const pathD = heroEdgePath(edge);
  const pathLen = heroEdgeLength(edge);
  const animDur = flowRateToAnimDur(flowRateM3h);
  const dashLen = pathLen * 0.15;
  const gapLen = pathLen * 0.85;

  return (
    <g data-edge-id={edge.id}>
      {/* Static pipe track */}
      <path d={pathD} fill="none" stroke="var(--border-mid)" strokeWidth="3" />

      {/* Active flow overlay — animated dash + travelling dot */}
      {isActive && (
        <>
          <path
            d={pathD}
            fill="none"
            stroke="var(--status-flow)"
            strokeWidth="3.5"
            strokeDasharray={`${dashLen} ${gapLen}`}
            style={{ animation: `flow-dash ${animDur}s linear infinite` }}
          />
          <circle r="4.5" fill="var(--status-flow)" opacity="0.85">
            <animateMotion dur={`${animDur}s`} repeatCount="indefinite" path={pathD} />
          </circle>
        </>
      )}
    </g>
  );
});

// ============================================================================
// HERO STATION NODE — clickable, status-ringed
// ============================================================================

interface HeroStationNodeProps {
  spec: HeroNodeSpec;
  station: Station;
  status: NodeStatus;
  isSelected: boolean;
  onClick: (stationId: string) => void;
}

const HeroStationNode = memo(function HeroStationNode({
  spec,
  station,
  status,
  isSelected,
  onClick,
}: HeroStationNodeProps) {
  const { x, y, role } = spec;
  const isStorage = role === HeroNodeRole.STORAGE;
  const radius = isStorage ? 16 : 10;
  const { ring, label: statusLabel } = STATUS_STYLE[status];

  const fill = isSelected ? "var(--amber-safety)" : "var(--surface-raised)";
  const stroke = isSelected ? "var(--amber-safety)" : "var(--border-strong)";

  // Name above for sources/deliveries, below for the storage farms.
  const nameY = isStorage ? y + 38 : y - 22;
  const statusY = isStorage ? y + 58 : y + 26;

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
      aria-label={`Estación ${station.name} — estado ${status}`}
      data-status={status}
    >
      {/* Status ring — non-OK nodes only */}
      {ring && (
        <circle
          cx={x}
          cy={y}
          r={radius + 6}
          fill="none"
          stroke={ring}
          strokeWidth="2.5"
          data-status-ring
          className="animate-[pulse-border_1.5s_ease-in-out_infinite]"
        />
      )}

      {/* Node glyph — diamond for deliveries, circle otherwise */}
      {role === HeroNodeRole.DELIVERY ? (
        <rect
          x={x - radius}
          y={y - radius}
          width={radius * 2}
          height={radius * 2}
          transform={`rotate(45 ${x} ${y})`}
          fill={fill}
          stroke={stroke}
          strokeWidth="2"
        />
      ) : (
        <circle cx={x} cy={y} r={radius} fill={fill} stroke={stroke} strokeWidth="2" />
      )}

      {/* Station name — large, readable from across the room */}
      <text
        x={x}
        y={nameY}
        textAnchor="middle"
        fontSize={isStorage ? 17 : 14}
        fontWeight={isStorage ? 600 : 500}
        fill={isStorage ? "var(--ink-primary)" : "var(--ink-secondary)"}
        style={MONO_STYLE}
      >
        {station.name}
      </text>

      {/* Status chip text — non-OK only */}
      {statusLabel && ring && (
        <text
          x={x}
          y={statusY}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill={ring}
          letterSpacing="0.1em"
          style={MONO_STYLE}
        >
          {statusLabel}
        </text>
      )}
    </g>
  );
});

// ============================================================================
// HERO MANIFOLD — custody valve glyph on the boundary
// ============================================================================

interface HeroManifoldProps {
  x: number;
  y: number;
  equipmentId: string | null;
  isSelected: boolean;
  onClick: (equipmentId: string) => void;
}

const HeroManifold = memo(function HeroManifold({
  x,
  y,
  equipmentId,
  isSelected,
  onClick,
}: HeroManifoldProps) {
  const stroke = isSelected ? "var(--amber-safety)" : "var(--border-strong)";
  const size = 14;

  const interactive = equipmentId !== null;

  return (
    <g
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            onClick: () => onClick(equipmentId),
            onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(equipmentId);
              }
            },
            style: { cursor: "pointer" },
            "aria-label": `Válvula de custodia ${CUSTODY_MANIFOLD_TAG}`,
          }
        : {})}
    >
      {/* Bowtie valve glyph */}
      <polygon
        points={`${x - size},${y - size / 1.4} ${x},${y} ${x - size},${y + size / 1.4}`}
        fill="var(--surface-raised)"
        stroke={stroke}
        strokeWidth="2"
      />
      <polygon
        points={`${x + size},${y - size / 1.4} ${x},${y} ${x + size},${y + size / 1.4}`}
        fill="var(--surface-raised)"
        stroke={stroke}
        strokeWidth="2"
      />
      <text
        x={x}
        y={y + 34}
        textAnchor="middle"
        fontSize={12}
        fill="var(--ink-tertiary)"
        style={MONO_STYLE}
      >
        {CUSTODY_MANIFOLD_TAG}
      </text>
    </g>
  );
});

// ============================================================================
// HERO TANK CARD — HTML overlay slot, per-tank live level (SR-014 pattern)
// ============================================================================

interface HeroTankCardProps {
  tank: Tank;
  slot: HeroTankSlot;
  isSelected: boolean;
  onClick: (tankId: string) => void;
}

const HeroTankCard = memo(function HeroTankCard({
  tank,
  slot,
  isSelected,
  onClick,
}: HeroTankCardProps) {
  // Fine-grained per-tank subscription — the card breathes with the sim loop.
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
      className="absolute"
      style={{
        left: pctX(slot.x),
        top: pctY(slot.y),
        width: pctX(slot.w),
        outline: isSelected ? "1px solid var(--amber-safety)" : "none",
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
      />
    </div>
  );
});

// ============================================================================
// CUSTODY CHIP — OTA↔OTC difference at the boundary
// ============================================================================

interface CustodyChipData {
  month: string;
  diffM3: number;
  diffPct: number;
}

interface CustodyChipProps {
  data: CustodyChipData;
}

function CustodyChip({ data }: CustodyChipProps) {
  const absPct = Math.abs(data.diffPct);
  const tone =
    absPct <= CUSTODY_TOLERANCE_PCT
      ? { color: "var(--status-ok)", bg: "var(--status-ok-bg)" }
      : absPct <= CUSTODY_TOLERANCE_PCT * 2
        ? { color: "var(--status-warning)", bg: "var(--status-warning-bg)" }
        : { color: "var(--status-critical)", bg: "var(--status-critical-bg)" };

  // MV-15: the chip lands on the binational custody-difference panel
  // (CustodyDiffPanel) mounted in the cockpit analytics deck.
  const href = `${MODULE_PATH.cockpit}#${CUSTODY_DIFF_ANCHOR}`;

  return (
    <Link
      href={href}
      className="absolute flex flex-col items-center gap-0.5 border bg-surface-overlay px-4 py-2 transition-colors hover:border-accent"
      style={{
        left: pctX(HERO_BOUNDARY.chip.x),
        top: pctY(HERO_BOUNDARY.chip.y),
        transform: "translate(-50%, -50%)",
        borderColor: tone.color,
        backgroundColor: tone.bg,
      }}
    >
      <span
        className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
        style={MONO_STYLE}
      >
        Descuadre OTA↔OTC
      </span>
      <span
        className="text-[17px] font-semibold tabular-nums leading-none"
        style={{ ...MONO_STYLE, color: tone.color }}
      >
        {M3_FORMAT.format(data.diffM3)} m³ · {PCT_FORMAT.format(data.diffPct)}%
      </span>
      <span className="text-[10px] tabular-nums text-ink-muted" style={MONO_STYLE}>
        {data.month} · GSV 60 °F
      </span>
    </Link>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CrudeMovementDiagramProps {
  world: PipelineWorld;
}

/**
 * CrudeMovementDiagram renders the fixed canonical topology (heroLayout) fed
 * by live store data. Self-contained: subscribes to simulationStore (levels,
 * flows, sim day) and selectionStore (selection) directly, so MV-14 only has
 * to mount it with the world.
 */
export function CrudeMovementDiagram({ world }: CrudeMovementDiagramProps) {
  const activeFlows = useActiveFlows();
  const selectEntity = useSelectionStore((s) => s.selectEntity);
  const selectedEntityId = useSelectionStore((s) => s.selectedEntityId);

  // Simulated day (YYYY-MM-DD) — string selector re-renders only on day change.
  const simDay = useSimulationStore((s) => new Date(s.simulatedTime).toISOString().slice(0, 10));

  // ── Canonical lookups ────────────────────────────────────────────────────
  const stationByTag = useMemo(() => {
    const map = new Map<string, Station>();
    for (const station of world.stations) {
      if (station.tag) map.set(station.tag, station);
    }
    return map;
  }, [world.stations]);

  const tagByStationId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [tag, station] of stationByTag) map.set(station.id, tag);
    return map;
  }, [stationByTag]);

  const tankByTag = useMemo(() => {
    const map = new Map<string, Tank>();
    for (const tank of world.tanks) map.set(tank.tag, tank);
    return map;
  }, [world.tanks]);

  const manifoldEquipment = useMemo(
    () => world.equipment.find((e) => e.tag === CUSTODY_MANIFOLD_TAG) ?? null,
    [world.equipment],
  );

  // ── Per-node status (MV-5) ───────────────────────────────────────────────
  const statusByTag = useMemo(() => {
    const map = new Map<string, NodeStatus>();
    for (const node of HERO_NODES) {
      const station = stationByTag.get(node.tag);
      if (station) map.set(node.tag, resolveNodeStatus(world, station.id, simDay));
    }
    return map;
  }, [world, stationByTag, simDay]);

  // ── Live edge activity ───────────────────────────────────────────────────
  const groupActivity = useMemo(() => {
    const flowTags: HeroFlowTags[] = activeFlows.map((f) => ({
      fromTag: tagByStationId.get(f.fromNodeId) ?? null,
      toTag: tagByStationId.get(f.toNodeId) ?? null,
      flowRateM3h: f.flowRateM3h,
    }));
    return computeEdgeGroupActivity(flowTags);
  }, [activeFlows, tagByStationId]);

  // ── Custody-difference chip (MV-1 data) ──────────────────────────────────
  const custody = useMemo<CustodyChipData | null>(() => {
    const records = world.custodyDifferences;
    if (records.length === 0) return null;

    const simMonth = simDay.slice(0, 7);
    let pool = records.filter((r) => r.period.slice(0, 7) === simMonth);
    let month = simMonth;
    if (pool.length === 0) {
      // Fallback: latest month available in the seed
      month = records.reduce((max, r) => {
        const m = r.period.slice(0, 7);
        return m > max ? m : max;
      }, "");
      pool = records.filter((r) => r.period.slice(0, 7) === month);
    }

    const originVolM3 = pool.reduce((sum, r) => sum + r.originVolM3, 0);
    const destVolM3 = pool.reduce((sum, r) => sum + r.destVolM3, 0);
    const { diffM3, diffPct } = computeCustodyDiff(originVolM3, destVolM3);
    return { month, diffM3, diffPct };
  }, [world.custodyDifferences, simDay]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleStationClick = useCallback(
    (stationId: string) => selectEntity(stationId, EntityType.STATION),
    [selectEntity],
  );
  const handleTankClick = useCallback(
    (tankId: string) => selectEntity(tankId, EntityType.TANK),
    [selectEntity],
  );
  const handleManifoldClick = useCallback(
    (equipmentId: string) => selectEntity(equipmentId, EntityType.EQUIPMENT),
    [selectEntity],
  );

  // ── Farm connectors (tank group → farm node) ─────────────────────────────
  const farmConnectors = useMemo(() => {
    const connectors: Array<{ tag: string; x: number; fromY: number; toY: number }> = [];
    for (const node of HERO_NODES) {
      if (node.role !== HeroNodeRole.STORAGE) continue;
      const slots = HERO_TANK_SLOTS.filter((s) => s.stationTag === node.tag);
      if (slots.length === 0) continue;
      const bottom = Math.max(...slots.map((s) => s.y + s.h));
      connectors.push({ tag: node.tag, x: node.x, fromY: bottom + 2, toY: node.y - 18 });
    }
    return connectors;
  }, []);

  return (
    <div
      className="w-full border border-border-mid bg-surface-raised overflow-hidden"
      role="region"
      aria-label="Diagrama de movimiento de crudo"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <span
          className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={MONO_STYLE}
        >
          Movimiento de Crudo
        </span>
        <span className="text-[12px] text-ink-muted" style={MONO_STYLE}>
          {activeFlows.length} flujos activos
        </span>
      </div>

      {/* Diagram body — ADR-7 sizing: fixed viewBox + aspect-ratio + max-width */}
      <div className="overflow-x-auto">
        <div
          className="relative mx-auto w-full min-w-[1000px]"
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, maxWidth: `${VIEW_MAX_W}px` }}
        >
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 block h-full w-full"
          >
            {/* Custody boundary — 15°C OTA left / 60°F OTC right */}
            <line
              x1={HERO_BOUNDARY.x}
              y1={HERO_BOUNDARY.topY}
              x2={HERO_BOUNDARY.x}
              y2={HERO_BOUNDARY.bottomY}
              stroke="var(--border-strong)"
              strokeWidth="1.5"
              strokeDasharray="8 6"
            />
            <text
              x={HERO_BOUNDARY.x - 16}
              y={54}
              textAnchor="end"
              fontSize={19}
              fontWeight={600}
              fill="var(--ink-secondary)"
              letterSpacing="0.14em"
              style={MONO_STYLE}
            >
              OTA · 15 °C
            </text>
            <text
              x={HERO_BOUNDARY.x + 16}
              y={54}
              textAnchor="start"
              fontSize={19}
              fontWeight={600}
              fill="var(--ink-secondary)"
              letterSpacing="0.14em"
              style={MONO_STYLE}
            >
              OTC · 60 °F
            </text>

            {/* Farm connectors — tank group down to its station node */}
            {farmConnectors.map((c) => (
              <line
                key={c.tag}
                x1={c.x}
                y1={c.fromY}
                x2={c.x}
                y2={c.toY}
                stroke="var(--border-mid)"
                strokeWidth="1.5"
                strokeDasharray="3 4"
              />
            ))}

            {/* Edges — live activity per group */}
            {HERO_EDGES.map((edge) => {
              const activity = groupActivity[edge.group];
              return (
                <HeroEdge
                  key={edge.id}
                  edge={edge}
                  isActive={activity.active}
                  flowRateM3h={activity.flowRateM3h || 500}
                />
              );
            })}

            {/* Nodes */}
            {HERO_NODES.map((node) => {
              if (node.role === HeroNodeRole.MANIFOLD) {
                return (
                  <HeroManifold
                    key={node.tag}
                    x={node.x}
                    y={node.y}
                    equipmentId={manifoldEquipment?.id ?? null}
                    isSelected={selectedEntityId === manifoldEquipment?.id}
                    onClick={handleManifoldClick}
                  />
                );
              }
              const station = stationByTag.get(node.tag);
              if (!station) return null;
              return (
                <HeroStationNode
                  key={node.tag}
                  spec={node}
                  station={station}
                  status={statusByTag.get(node.tag) ?? NodeStatus.OK}
                  isSelected={selectedEntityId === station.id}
                  onClick={handleStationClick}
                />
              );
            })}
          </svg>

          {/* HTML overlay — live tank cards on their layout slots */}
          {HERO_TANK_SLOTS.map((slot) => {
            const tank = tankByTag.get(slot.tag);
            if (!tank) return null;
            return (
              <HeroTankCard
                key={slot.tag}
                tank={tank}
                slot={slot}
                isSelected={selectedEntityId === tank.id}
                onClick={handleTankClick}
              />
            );
          })}

          {/* HTML overlay — custody-difference chip on the boundary */}
          {custody && (
            <CustodyChip data={custody} />
          )}

          {/* HTML overlay — equipment cross-nav under the manifold (MV-19).
              The glyph keeps its click → selectEntity (?focus=) behavior;
              this link is the hub-and-spoke jump to /equipment/[id]. */}
          {manifoldEquipment && (
            <Link
              href={`${MODULE_PATH.equipment}/${manifoldEquipment.id}`}
              className="absolute text-[11px] font-medium uppercase tracking-[0.1em] text-ink-tertiary transition-colors hover:text-accent"
              style={{
                ...MONO_STYLE,
                left: pctX(HERO_BOUNDARY.x),
                top: pctY(384),
                transform: "translate(-50%, 0)",
              }}
            >
              Ver equipo →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
