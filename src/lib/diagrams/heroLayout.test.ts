/**
 * heroLayout tests (MV-12) — pure illustrative layout for the crude movement hero.
 * Strict TDD: topology completeness, edge referential integrity, custody-boundary
 * separation (15°C OTA left / 60°F OTC right), and edge-group activity rules.
 */

import { describe, it, expect } from "vitest";
import {
  CANONICAL_STATION_TAGS,
  CANONICAL_STATIONS,
  CANONICAL_TANKS,
  CUSTODY_MANIFOLD_TAG,
} from "@/lib/data/canonical";
import { VolumeBasis } from "@/lib/domain";
import {
  HERO_VIEW,
  HERO_NODES,
  HERO_EDGES,
  HERO_TANK_SLOTS,
  HERO_BOUNDARY,
  HeroSide,
  HeroEdgeGroup,
  heroEdgePath,
  heroEdgeLength,
  heroEdgeJoints,
  computeEdgeGroupActivity,
} from "./heroLayout";
import type { HeroEdgeSpec } from "./heroLayout";

const PH_TAG = CANONICAL_STATION_TAGS.PUERTO_HERNANDEZ;
const TC_TAG = CANONICAL_STATION_TAGS.TERMINAL_CONCEPCION;

const nodeByTag = new Map(HERO_NODES.map((n) => [n.tag, n]));

// ---------------------------------------------------------------------------
// Topology completeness
// ---------------------------------------------------------------------------

describe("HERO_NODES — topology completeness", () => {
  it("has one node for every canonical station tag", () => {
    for (const spec of CANONICAL_STATIONS) {
      expect(nodeByTag.has(spec.tag), `missing node for ${spec.tag}`).toBe(true);
    }
  });

  it("has a node for the custody manifold", () => {
    expect(nodeByTag.has(CUSTODY_MANIFOLD_TAG)).toBe(true);
  });

  it("has unique tags and no extra nodes beyond the canonical topology", () => {
    const tags = HERO_NODES.map((n) => n.tag);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.length).toBe(CANONICAL_STATIONS.length + 1);
  });

  it("places every node inside the viewBox", () => {
    for (const node of HERO_NODES) {
      expect(node.x, `${node.tag} x`).toBeGreaterThan(0);
      expect(node.x, `${node.tag} x`).toBeLessThan(HERO_VIEW.width);
      expect(node.y, `${node.tag} y`).toBeGreaterThan(0);
      expect(node.y, `${node.tag} y`).toBeLessThan(HERO_VIEW.height);
    }
  });
});

// ---------------------------------------------------------------------------
// Custody boundary — 15°C OTA left / 60°F OTC right
// ---------------------------------------------------------------------------

describe("HERO_BOUNDARY — custody separation", () => {
  it("keeps every OTA node strictly left of the boundary", () => {
    const otaNodes = HERO_NODES.filter((n) => n.side === HeroSide.OTA);
    expect(otaNodes.length).toBeGreaterThan(0);
    for (const node of otaNodes) {
      expect(node.x, node.tag).toBeLessThan(HERO_BOUNDARY.x);
    }
  });

  it("keeps every OTC node strictly right of the boundary", () => {
    const otcNodes = HERO_NODES.filter((n) => n.side === HeroSide.OTC);
    expect(otcNodes.length).toBeGreaterThan(0);
    for (const node of otcNodes) {
      expect(node.x, node.tag).toBeGreaterThan(HERO_BOUNDARY.x);
    }
  });

  it("places the custody manifold exactly on the boundary", () => {
    const manifold = nodeByTag.get(CUSTODY_MANIFOLD_TAG);
    expect(manifold?.side).toBe(HeroSide.BOUNDARY);
    expect(manifold?.x).toBe(HERO_BOUNDARY.x);
  });

  it("keeps the boundary line and chip anchor inside the viewBox", () => {
    expect(HERO_BOUNDARY.x).toBeGreaterThan(0);
    expect(HERO_BOUNDARY.x).toBeLessThan(HERO_VIEW.width);
    expect(HERO_BOUNDARY.topY).toBeGreaterThanOrEqual(0);
    expect(HERO_BOUNDARY.bottomY).toBeLessThanOrEqual(HERO_VIEW.height);
    expect(HERO_BOUNDARY.chip.y).toBeGreaterThan(HERO_BOUNDARY.topY);
    expect(HERO_BOUNDARY.chip.y).toBeLessThan(HERO_BOUNDARY.bottomY);
  });
});

// ---------------------------------------------------------------------------
// Tank slots
// ---------------------------------------------------------------------------

describe("HERO_TANK_SLOTS", () => {
  const slotByTag = new Map(HERO_TANK_SLOTS.map((s) => [s.tag, s]));

  it("has one slot per canonical tank, hosted at the canonical station", () => {
    expect(HERO_TANK_SLOTS.length).toBe(CANONICAL_TANKS.length);
    for (const spec of CANONICAL_TANKS) {
      const slot = slotByTag.get(spec.tag);
      expect(slot, `missing slot for ${spec.tag}`).toBeDefined();
      expect(slot?.stationTag).toBe(spec.stationTag);
    }
  });

  it("keeps every slot inside the viewBox", () => {
    for (const slot of HERO_TANK_SLOTS) {
      expect(slot.x, slot.tag).toBeGreaterThanOrEqual(0);
      expect(slot.y, slot.tag).toBeGreaterThanOrEqual(0);
      expect(slot.x + slot.w, slot.tag).toBeLessThanOrEqual(HERO_VIEW.width);
      expect(slot.y + slot.h, slot.tag).toBeLessThanOrEqual(HERO_VIEW.height);
    }
  });

  it("keeps 15°C tanks fully left and 60°F tanks fully right of the boundary", () => {
    for (const spec of CANONICAL_TANKS) {
      const slot = slotByTag.get(spec.tag)!;
      if (spec.volumeBasis === VolumeBasis.C15) {
        expect(slot.x + slot.w, spec.tag).toBeLessThan(HERO_BOUNDARY.x);
      } else {
        expect(slot.x, spec.tag).toBeGreaterThan(HERO_BOUNDARY.x);
      }
    }
  });

  it("does not overlap slots of the same station vertically", () => {
    const byStation = new Map<string, typeof HERO_TANK_SLOTS[number][]>();
    for (const slot of HERO_TANK_SLOTS) {
      const list = byStation.get(slot.stationTag) ?? [];
      list.push(slot);
      byStation.set(slot.stationTag, list);
    }
    for (const [, slots] of byStation) {
      const sorted = [...slots].sort((a, b) => a.y - b.y);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].y, sorted[i].tag).toBeGreaterThanOrEqual(
          sorted[i - 1].y + sorted[i - 1].h,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

describe("HERO_EDGES", () => {
  it("references only existing node tags", () => {
    for (const edge of HERO_EDGES) {
      expect(nodeByTag.has(edge.fromTag), `${edge.id} from`).toBe(true);
      expect(nodeByTag.has(edge.toTag), `${edge.id} to`).toBe(true);
    }
  });

  it("connects every node to at least one edge", () => {
    const connected = new Set<string>();
    for (const edge of HERO_EDGES) {
      connected.add(edge.fromTag);
      connected.add(edge.toTag);
    }
    for (const node of HERO_NODES) {
      expect(connected.has(node.tag), node.tag).toBe(true);
    }
  });

  it("routes every inlet edge into Puerto Hernández", () => {
    const inlets = HERO_EDGES.filter((e) => e.group === HeroEdgeGroup.INLETS);
    expect(inlets.length).toBe(3);
    for (const edge of inlets) expect(edge.toTag).toBe(PH_TAG);
  });

  it("routes the trunk PH → manifold → TC", () => {
    const trunk = HERO_EDGES.filter((e) => e.group === HeroEdgeGroup.TRUNK);
    expect(trunk.map((e) => [e.fromTag, e.toTag])).toEqual([
      [PH_TAG, CUSTODY_MANIFOLD_TAG],
      [CUSTODY_MANIFOLD_TAG, TC_TAG],
    ]);
  });

  it("routes every delivery edge out of Terminal Concepción", () => {
    const deliveries = HERO_EDGES.filter((e) => e.group === HeroEdgeGroup.DELIVERIES);
    expect(deliveries.length).toBe(3);
    for (const edge of deliveries) expect(edge.fromTag).toBe(TC_TAG);
  });

  it("has at least two in-bounds waypoints per edge, ordered from → to", () => {
    for (const edge of HERO_EDGES) {
      expect(edge.waypoints.length, edge.id).toBeGreaterThanOrEqual(2);
      for (const wp of edge.waypoints) {
        expect(wp.x, edge.id).toBeGreaterThanOrEqual(0);
        expect(wp.x, edge.id).toBeLessThanOrEqual(HERO_VIEW.width);
        expect(wp.y, edge.id).toBeGreaterThanOrEqual(0);
        expect(wp.y, edge.id).toBeLessThanOrEqual(HERO_VIEW.height);
      }
      const from = nodeByTag.get(edge.fromTag)!;
      const to = nodeByTag.get(edge.toTag)!;
      const first = edge.waypoints[0];
      const last = edge.waypoints[edge.waypoints.length - 1];
      const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot(a.x - b.x, a.y - b.y);
      expect(dist(first, from), `${edge.id} starts near ${edge.fromTag}`).toBeLessThan(
        dist(first, to),
      );
      expect(dist(last, to), `${edge.id} ends near ${edge.toTag}`).toBeLessThan(dist(last, from));
    }
  });
});

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

describe("heroEdgePath / heroEdgeLength", () => {
  it("builds an SVG polyline path from the waypoints", () => {
    for (const edge of HERO_EDGES) {
      const path = heroEdgePath(edge);
      expect(path.startsWith("M "), edge.id).toBe(true);
      const lineCommands = path.split("L").length - 1;
      expect(lineCommands, edge.id).toBe(edge.waypoints.length - 1);
    }
  });

  it("computes the exact length of a straight edge", () => {
    const straight = HERO_EDGES.find(
      (e) => e.fromTag === CUSTODY_MANIFOLD_TAG && e.toTag === TC_TAG,
    )!;
    const [a, b] = [straight.waypoints[0], straight.waypoints[straight.waypoints.length - 1]];
    expect(heroEdgeLength(straight)).toBeCloseTo(Math.hypot(b.x - a.x, b.y - a.y), 6);
  });

  it("returns a positive length for every edge", () => {
    for (const edge of HERO_EDGES) {
      expect(heroEdgeLength(edge), edge.id).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge-group activity (live-flow mapping rules)
// ---------------------------------------------------------------------------

describe("computeEdgeGroupActivity", () => {
  it("returns all groups inactive with no flows", () => {
    const activity = computeEdgeGroupActivity([]);
    for (const group of Object.values(HeroEdgeGroup)) {
      expect(activity[group].active).toBe(false);
      expect(activity[group].flowRateM3h).toBe(0);
    }
  });

  it("activates inlets and trunk when Puerto Hernández dispatches", () => {
    const activity = computeEdgeGroupActivity([
      { fromTag: PH_TAG, toTag: null, flowRateM3h: 800 },
    ]);
    expect(activity[HeroEdgeGroup.INLETS]).toEqual({ active: true, flowRateM3h: 800 });
    expect(activity[HeroEdgeGroup.TRUNK]).toEqual({ active: true, flowRateM3h: 800 });
    expect(activity[HeroEdgeGroup.DELIVERIES].active).toBe(false);
  });

  it("activates trunk and deliveries when Terminal Concepción receives", () => {
    const activity = computeEdgeGroupActivity([
      { fromTag: null, toTag: TC_TAG, flowRateM3h: 600 },
    ]);
    expect(activity[HeroEdgeGroup.TRUNK]).toEqual({ active: true, flowRateM3h: 600 });
    expect(activity[HeroEdgeGroup.DELIVERIES]).toEqual({ active: true, flowRateM3h: 600 });
    expect(activity[HeroEdgeGroup.INLETS].active).toBe(false);
  });

  it("activates only inlets when Puerto Hernández receives", () => {
    const activity = computeEdgeGroupActivity([
      { fromTag: null, toTag: PH_TAG, flowRateM3h: 400 },
    ]);
    expect(activity[HeroEdgeGroup.INLETS].active).toBe(true);
    expect(activity[HeroEdgeGroup.TRUNK].active).toBe(false);
    expect(activity[HeroEdgeGroup.DELIVERIES].active).toBe(false);
  });

  it("activates only deliveries when Terminal Concepción dispatches", () => {
    const activity = computeEdgeGroupActivity([
      { fromTag: TC_TAG, toTag: null, flowRateM3h: 500 },
    ]);
    expect(activity[HeroEdgeGroup.DELIVERIES].active).toBe(true);
    expect(activity[HeroEdgeGroup.INLETS].active).toBe(false);
    expect(activity[HeroEdgeGroup.TRUNK].active).toBe(false);
  });

  it("ignores flows that touch no canonical custody station", () => {
    const activity = computeEdgeGroupActivity([
      { fromTag: null, toTag: null, flowRateM3h: 900 },
      { fromTag: "OTA-VMON", toTag: "REF-BIOBIO", flowRateM3h: 900 },
    ]);
    for (const group of Object.values(HeroEdgeGroup)) {
      expect(activity[group].active).toBe(false);
    }
  });

  it("keeps the maximum flow rate per group across matching flows", () => {
    const activity = computeEdgeGroupActivity([
      { fromTag: PH_TAG, toTag: null, flowRateM3h: 300 },
      { fromTag: null, toTag: TC_TAG, flowRateM3h: 1200 },
    ]);
    expect(activity[HeroEdgeGroup.TRUNK].flowRateM3h).toBe(1200);
    expect(activity[HeroEdgeGroup.INLETS].flowRateM3h).toBe(300);
    expect(activity[HeroEdgeGroup.DELIVERIES].flowRateM3h).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// Pipe joints (flange placement)
// ---------------------------------------------------------------------------

describe("heroEdgeJoints", () => {
  const edge = (waypoints: Array<{ x: number; y: number }>): HeroEdgeSpec => ({
    id: "test",
    fromTag: "A",
    toTag: "B",
    group: HeroEdgeGroup.TRUNK,
    waypoints,
  });

  it("places one joint per waypoint, at the waypoint", () => {
    for (const e of HERO_EDGES) {
      const joints = heroEdgeJoints(e);
      expect(joints.length, e.id).toBe(e.waypoints.length);
      joints.forEach((j, i) => {
        expect(j.x, e.id).toBe(e.waypoints[i].x);
        expect(j.y, e.id).toBe(e.waypoints[i].y);
      });
    }
  });

  it("aligns end joints with the bearing of their own segment", () => {
    // Horizontal run left→right: both ends bear 0°.
    const joints = heroEdgeJoints(edge([{ x: 0, y: 0 }, { x: 100, y: 0 }]));
    expect(joints[0].angleDeg).toBeCloseTo(0);
    expect(joints[1].angleDeg).toBeCloseTo(0);
  });

  it("bisects the two bearings at a bend", () => {
    // 0° in, 90° out → the flange sits on the 45° mitre.
    const joints = heroEdgeJoints(
      edge([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]),
    );
    expect(joints[1].angleDeg).toBeCloseTo(45);
  });

  it("bisects safely across the ±180° wrap", () => {
    // Bearings 135° in and -135° out straddle the wrap: averaging them
    // numerically yields 0° (the opposite side). The true bisector is ±180°.
    const joints = heroEdgeJoints(
      edge([{ x: 200, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 0 }]),
    );
    expect(Math.abs(joints[1].angleDeg)).toBeCloseTo(180);
  });

  it("keeps every joint inside the viewBox", () => {
    for (const e of HERO_EDGES) {
      for (const j of heroEdgeJoints(e)) {
        expect(j.x, e.id).toBeGreaterThanOrEqual(0);
        expect(j.x, e.id).toBeLessThanOrEqual(HERO_VIEW.width);
        expect(j.y, e.id).toBeGreaterThanOrEqual(0);
        expect(j.y, e.id).toBeLessThanOrEqual(HERO_VIEW.height);
      }
    }
  });
});
