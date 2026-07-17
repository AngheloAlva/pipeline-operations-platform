/**
 * Pure illustrative layout for the crude movement hero diagram (MV-12).
 *
 * Fixed positions, sizes, edge waypoints, and the custody-boundary line for
 * the canonical hero topology (lib/data/canonical.ts), keyed by stable node
 * tags. Coordinates are SVG viewBox units following the ADR-7 sizing pattern:
 * a fixed logical viewBox (HERO_VIEW) rendered with preserveAspectRatio +
 * CSS aspect-ratio + max-width by the consuming component.
 *
 * No React, no store access, no side effects — plain data + pure helpers.
 */

import { CANONICAL_STATION_TAGS, CUSTODY_MANIFOLD_TAG } from "@/lib/data/canonical";

// ============================================================================
// VIEWBOX
// ============================================================================

/** Logical viewBox of the hero diagram (ADR-7 fixed logical size). */
export const HERO_VIEW = { width: 1080, height: 440 } as const;

// ============================================================================
// TYPES
// ============================================================================

/** Custody side of a hero node: OTA (15°C, left), OTC (60°F, right). */
export const HeroSide = {
  OTA: "OTA",
  OTC: "OTC",
  /** Sits exactly on the custody boundary (the manifold valve). */
  BOUNDARY: "BOUNDARY",
} as const;
export type HeroSide = (typeof HeroSide)[keyof typeof HeroSide];

/** Visual role of a hero node — the component picks the glyph by role. */
export const HeroNodeRole = {
  SOURCE: "source",
  STORAGE: "storage",
  MANIFOLD: "manifold",
  DELIVERY: "delivery",
} as const;
export type HeroNodeRole = (typeof HeroNodeRole)[keyof typeof HeroNodeRole];

export interface HeroPoint {
  x: number;
  y: number;
}

/** Fixed layout entry for one hero node, keyed by its stable canonical tag. */
export interface HeroNodeSpec {
  tag: string;
  x: number;
  y: number;
  side: HeroSide;
  role: HeroNodeRole;
}

/**
 * Edge groups map live flows onto the illustrative edges: the seed's
 * movements run between mainline stations, so hero edges animate per
 * GROUP (inlets / trunk / deliveries) rather than per station pair.
 */
export const HeroEdgeGroup = {
  INLETS: "inlets",
  TRUNK: "trunk",
  DELIVERIES: "deliveries",
} as const;
export type HeroEdgeGroup = (typeof HeroEdgeGroup)[keyof typeof HeroEdgeGroup];

/** Fixed polyline edge between two hero nodes. */
export interface HeroEdgeSpec {
  id: string;
  fromTag: string;
  toTag: string;
  group: HeroEdgeGroup;
  /** Ordered waypoints from source to destination (viewBox units). */
  waypoints: readonly HeroPoint[];
}

/** Overlay slot (viewBox units) where a canonical tank card renders. */
export interface HeroTankSlot {
  tag: string;
  stationTag: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ============================================================================
// NODES
// ============================================================================

const TAGS = CANONICAL_STATION_TAGS;

/** Main pipeline axis (viewBox y). */
const AXIS_Y = 330;

/** Fixed hero node layout — canonical stations + the custody manifold. */
export const HERO_NODES: readonly HeroNodeSpec[] = [
  // OTA inlets (Argentina, left column)
  { tag: TAGS.OLDELVAL_INLET, x: 110, y: 250, side: HeroSide.OTA, role: HeroNodeRole.SOURCE },
  { tag: TAGS.VMON_INLET, x: 110, y: AXIS_Y, side: HeroSide.OTA, role: HeroNodeRole.SOURCE },
  { tag: TAGS.ACTIVO_YPF_INLET, x: 110, y: 410, side: HeroSide.OTA, role: HeroNodeRole.SOURCE },
  // OTA custody tank farm (15°C)
  { tag: TAGS.PUERTO_HERNANDEZ, x: 330, y: AXIS_Y, side: HeroSide.OTA, role: HeroNodeRole.STORAGE },
  // Custody manifold valve — sits exactly on the boundary
  { tag: CUSTODY_MANIFOLD_TAG, x: 540, y: AXIS_Y, side: HeroSide.BOUNDARY, role: HeroNodeRole.MANIFOLD },
  // OTC custody tank farm (60°F)
  { tag: TAGS.TERMINAL_CONCEPCION, x: 750, y: AXIS_Y, side: HeroSide.OTC, role: HeroNodeRole.STORAGE },
  // OTC delivery points (Chile, right column)
  { tag: TAGS.BIO_BIO_REFINERY, x: 990, y: 250, side: HeroSide.OTC, role: HeroNodeRole.DELIVERY },
  { tag: TAGS.SAN_VICENTE_TERMINAL, x: 990, y: AXIS_Y, side: HeroSide.OTC, role: HeroNodeRole.DELIVERY },
  { tag: TAGS.VESSEL, x: 990, y: 410, side: HeroSide.OTC, role: HeroNodeRole.DELIVERY },
] as const;

// ============================================================================
// CUSTODY BOUNDARY
// ============================================================================

/**
 * Vertical custody boundary: 15°C OTA regime on the left, 60°F OTC regime
 * on the right. `chip` anchors the custody-difference chip on the line.
 */
export const HERO_BOUNDARY = {
  x: 540,
  topY: 30,
  bottomY: 414,
  chip: { x: 540, y: 170 },
} as const;

// ============================================================================
// TANK SLOTS
// ============================================================================

const SLOT_W = 190;
const SLOT_H = 80;
/** Vertical pitch between stacked slots (leaves an 8-unit gap). */
const SLOT_PITCH = 88;

/** Overlay slots for the canonical custody tanks, above their farm node. */
export const HERO_TANK_SLOTS: readonly HeroTankSlot[] = [
  // Puerto Hernández — 15°C regime (left of the boundary)
  { tag: "T-101", stationTag: TAGS.PUERTO_HERNANDEZ, x: 228, y: 96, w: SLOT_W, h: SLOT_H },
  { tag: "T-102", stationTag: TAGS.PUERTO_HERNANDEZ, x: 228, y: 96 + SLOT_PITCH, w: SLOT_W, h: SLOT_H },
  // Terminal Concepción — 60°F regime (right of the boundary)
  { tag: "T-6010", stationTag: TAGS.TERMINAL_CONCEPCION, x: 655, y: 52, w: SLOT_W, h: SLOT_H },
  { tag: "T-6020", stationTag: TAGS.TERMINAL_CONCEPCION, x: 655, y: 52 + SLOT_PITCH, w: SLOT_W, h: SLOT_H },
  { tag: "T-6030", stationTag: TAGS.TERMINAL_CONCEPCION, x: 655, y: 52 + SLOT_PITCH * 2, w: SLOT_W, h: SLOT_H },
] as const;

// ============================================================================
// EDGES
// ============================================================================

/** Fixed polyline edges: inlets → PH → manifold → TC → deliveries. */
export const HERO_EDGES: readonly HeroEdgeSpec[] = [
  // OTA inlets converge into Puerto Hernández
  {
    id: "oldelval-ph",
    fromTag: TAGS.OLDELVAL_INLET,
    toTag: TAGS.PUERTO_HERNANDEZ,
    group: HeroEdgeGroup.INLETS,
    waypoints: [
      { x: 130, y: 250 },
      { x: 215, y: 250 },
      { x: 262, y: AXIS_Y },
      { x: 306, y: AXIS_Y },
    ],
  },
  {
    id: "vmon-ph",
    fromTag: TAGS.VMON_INLET,
    toTag: TAGS.PUERTO_HERNANDEZ,
    group: HeroEdgeGroup.INLETS,
    waypoints: [
      { x: 130, y: AXIS_Y },
      { x: 306, y: AXIS_Y },
    ],
  },
  {
    id: "ypf-ph",
    fromTag: TAGS.ACTIVO_YPF_INLET,
    toTag: TAGS.PUERTO_HERNANDEZ,
    group: HeroEdgeGroup.INLETS,
    waypoints: [
      { x: 130, y: 410 },
      { x: 215, y: 410 },
      { x: 262, y: AXIS_Y },
      { x: 306, y: AXIS_Y },
    ],
  },
  // Trunk across the custody boundary
  {
    id: "ph-manifold",
    fromTag: TAGS.PUERTO_HERNANDEZ,
    toTag: CUSTODY_MANIFOLD_TAG,
    group: HeroEdgeGroup.TRUNK,
    waypoints: [
      { x: 354, y: AXIS_Y },
      { x: 518, y: AXIS_Y },
    ],
  },
  {
    id: "manifold-tc",
    fromTag: CUSTODY_MANIFOLD_TAG,
    toTag: TAGS.TERMINAL_CONCEPCION,
    group: HeroEdgeGroup.TRUNK,
    waypoints: [
      { x: 562, y: AXIS_Y },
      { x: 726, y: AXIS_Y },
    ],
  },
  // Deliveries fan out of Terminal Concepción
  {
    id: "tc-refinery",
    fromTag: TAGS.TERMINAL_CONCEPCION,
    toTag: TAGS.BIO_BIO_REFINERY,
    group: HeroEdgeGroup.DELIVERIES,
    waypoints: [
      { x: 774, y: AXIS_Y },
      { x: 848, y: 250 },
      { x: 966, y: 250 },
    ],
  },
  {
    id: "tc-sanvicente",
    fromTag: TAGS.TERMINAL_CONCEPCION,
    toTag: TAGS.SAN_VICENTE_TERMINAL,
    group: HeroEdgeGroup.DELIVERIES,
    waypoints: [
      { x: 774, y: AXIS_Y },
      { x: 966, y: AXIS_Y },
    ],
  },
  {
    id: "tc-vessel",
    fromTag: TAGS.TERMINAL_CONCEPCION,
    toTag: TAGS.VESSEL,
    group: HeroEdgeGroup.DELIVERIES,
    waypoints: [
      { x: 774, y: AXIS_Y },
      { x: 848, y: 410 },
      { x: 966, y: 410 },
    ],
  },
] as const;

// ============================================================================
// PATH HELPERS
// ============================================================================

/** Build the SVG path string ("M x y L x y …") for an edge's polyline. */
export function heroEdgePath(edge: HeroEdgeSpec): string {
  const [first, ...rest] = edge.waypoints;
  const lines = rest.map((p) => `L ${p.x} ${p.y}`).join(" ");
  return `M ${first.x} ${first.y} ${lines}`;
}

/** Total polyline length of an edge (viewBox units) — used for dash sizing. */
export function heroEdgeLength(edge: HeroEdgeSpec): number {
  let length = 0;
  for (let i = 1; i < edge.waypoints.length; i++) {
    const a = edge.waypoints[i - 1];
    const b = edge.waypoints[i];
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

// ============================================================================
// EDGE-GROUP ACTIVITY — map live flows onto the illustrative edges
// ============================================================================

/** A live flow reduced to canonical tags (null = non-canonical station). */
export interface HeroFlowTags {
  fromTag: string | null;
  toTag: string | null;
  flowRateM3h: number;
}

/** Whether a group animates, and the fastest matching flow rate. */
export interface HeroGroupActivity {
  active: boolean;
  flowRateM3h: number;
}

/**
 * Derive per-group activity from live flows. Seed movements run between
 * mainline stations, so activity aggregates around the two custody farms:
 * - inlets:     any flow touching Puerto Hernández (crude entering/leaving OTA storage)
 * - trunk:      PH dispatching downstream, or TC receiving (mainline crossing custody)
 * - deliveries: any flow touching Terminal Concepción (OTC throughput)
 */
export function computeEdgeGroupActivity(
  flows: readonly HeroFlowTags[],
): Record<HeroEdgeGroup, HeroGroupActivity> {
  const PH = TAGS.PUERTO_HERNANDEZ;
  const TC = TAGS.TERMINAL_CONCEPCION;

  const matchers: Record<HeroEdgeGroup, (flow: HeroFlowTags) => boolean> = {
    [HeroEdgeGroup.INLETS]: (f) => f.fromTag === PH || f.toTag === PH,
    [HeroEdgeGroup.TRUNK]: (f) => f.fromTag === PH || f.toTag === TC,
    [HeroEdgeGroup.DELIVERIES]: (f) => f.fromTag === TC || f.toTag === TC,
  };

  const activity = {} as Record<HeroEdgeGroup, HeroGroupActivity>;
  for (const group of Object.values(HeroEdgeGroup)) {
    const matching = flows.filter(matchers[group]);
    activity[group] = {
      active: matching.length > 0,
      flowRateM3h: matching.reduce((max, f) => Math.max(max, f.flowRateM3h), 0),
    };
  }
  return activity;
}
