/**
 * TDD — SVG layout helpers for FlowDiagram.
 * RED phase: tests written before implementation.
 * SR-005 req 2 (data-derived positions), SR-014 (no hardcoded values).
 */

import { describe, it, expect } from "vitest";
import {
  allocateAnchorAwareLanes,
  buildEdges,
  buildStationLayout,
  flowRateToAnimDur,
  kmToX,
} from "./layout";

// ============================================================================
// kmToX
// ============================================================================

describe("kmToX", () => {
  it("maps km=0 to x=PADDING", () => {
    const x = kmToX(0, 0, 500, 1080, 20);
    expect(x).toBe(20);
  });

  it("maps km=maxKm to x=viewWidth-PADDING", () => {
    const x = kmToX(500, 0, 500, 1080, 20);
    expect(x).toBe(1060);
  });

  it("maps a mid-point proportionally", () => {
    // km=250, range 0-500, view 0-1080, padding 0
    const x = kmToX(250, 0, 500, 1080, 0);
    expect(x).toBe(540);
  });

  it("proportional with non-zero minKm", () => {
    // range 100-600 (span=500), km=350 => 50% through => 540 in 0-1080 with pad 0
    const x = kmToX(350, 100, 600, 1080, 0);
    expect(x).toBeCloseTo(540, 5);
  });

  it("clamps below minKm to leftmost padded position", () => {
    const x = kmToX(-10, 0, 500, 1080, 20);
    expect(x).toBe(20);
  });

  it("clamps above maxKm to rightmost padded position", () => {
    const x = kmToX(600, 0, 500, 1080, 20);
    expect(x).toBe(1060);
  });
});

// ============================================================================
// buildStationLayout
// ============================================================================

describe("buildStationLayout", () => {
  const stations = [
    { id: "s1", km: 0, name: "Origen" },
    { id: "s2", km: 250, name: "Intermedia" },
    { id: "s3", km: 500, name: "Terminal" },
  ];

  it("returns a layout entry per station", () => {
    const layout = buildStationLayout(stations, 1080, 20);
    expect(layout).toHaveLength(3);
  });

  it("leftmost station has the smallest x", () => {
    const layout = buildStationLayout(stations, 1080, 20);
    const xs = layout.map((l) => l.x);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it("preserves station id in layout entry", () => {
    const layout = buildStationLayout(stations, 1080, 20);
    expect(layout.map((l) => l.stationId)).toEqual(["s1", "s2", "s3"]);
  });
});

// ============================================================================
// buildEdges
// ============================================================================

describe("buildEdges", () => {
  it("returns empty array when activeFlows is empty", () => {
    const edges = buildEdges([], {});
    expect(edges).toHaveLength(0);
  });

  it("returns one edge per unique fromNodeId/toNodeId pair in activeFlows", () => {
    const nodePositions = {
      "T-101": { x: 100, y: 100 },
      "T-6010": { x: 400, y: 100 },
    };
    const activeFlows = [{ fromNodeId: "T-101", toNodeId: "T-6010", flowRateM3h: 500 }];
    const edges = buildEdges(activeFlows, nodePositions);
    expect(edges).toHaveLength(1);
    expect(edges[0].fromNodeId).toBe("T-101");
    expect(edges[0].toNodeId).toBe("T-6010");
  });

  it("deduplicates identical fromNodeId/toNodeId pairs", () => {
    const nodePositions = {
      "T-101": { x: 100, y: 100 },
      "T-6010": { x: 400, y: 100 },
    };
    const activeFlows = [
      { fromNodeId: "T-101", toNodeId: "T-6010", flowRateM3h: 500 },
      { fromNodeId: "T-101", toNodeId: "T-6010", flowRateM3h: 300 },
    ];
    const edges = buildEdges(activeFlows, nodePositions);
    expect(edges).toHaveLength(1);
  });

  it("omits edges where either node position is missing", () => {
    const nodePositions = {
      "T-101": { x: 100, y: 100 },
      // T-6010 missing
    };
    const activeFlows = [{ fromNodeId: "T-101", toNodeId: "T-6010", flowRateM3h: 500 }];
    const edges = buildEdges(activeFlows, nodePositions);
    expect(edges).toHaveLength(0);
  });

  it("includes x/y coordinates from nodePositions in the edge", () => {
    const nodePositions = {
      "T-101": { x: 100, y: 150 },
      "T-6010": { x: 400, y: 200 },
    };
    const activeFlows = [{ fromNodeId: "T-101", toNodeId: "T-6010", flowRateM3h: 500 }];
    const edges = buildEdges(activeFlows, nodePositions);
    expect(edges[0].x1).toBe(100);
    expect(edges[0].y1).toBe(150);
    expect(edges[0].x2).toBe(400);
    expect(edges[0].y2).toBe(200);
  });
});

// ============================================================================
// allocateAnchorAwareLanes
// ============================================================================

describe("allocateAnchorAwareLanes", () => {
  it("separates a dense endpoint cluster while anchoring the endpoints inward", () => {
    const placements = allocateAnchorAwareLanes(
      [
        { id: "oldelval", x: 1, width: 112 },
        { id: "vmon", x: 3, width: 92 },
        { id: "ypf", x: 5, width: 110 },
        { id: "puerto", x: 8, width: 118 },
      ],
      { left: 0, right: 1080 },
    );

    expect(placements.map((placement) => placement.id)).toEqual([
      "oldelval",
      "vmon",
      "ypf",
      "puerto",
    ]);
    expect(placements[0]).toMatchObject({ textAnchor: "start", lane: 0 });
    expect(new Set(placements.map((placement) => placement.lane)).size).toBe(4);
  });

  it("reuses a lane only after the previous label's guttered interval ends", () => {
    const placements = allocateAnchorAwareLanes([
      { id: "first", x: 120, width: 80 },
      { id: "second", x: 340, width: 80 },
      { id: "third", x: 150, width: 80 },
    ]);

    expect(placements.find((placement) => placement.id === "first")?.lane).toBe(0);
    expect(placements.find((placement) => placement.id === "second")?.lane).toBe(0);
    expect(placements.find((placement) => placement.id === "third")?.lane).toBe(1);
  });
});

// ============================================================================
// flowRateToAnimDur — Fix 7 (animateMotion dur derived from flow rate)
// RED: flowRateToAnimDur does not exist yet; tests written before implementation.
// ============================================================================

describe("flowRateToAnimDur", () => {
  // Faster flow → shorter duration (snappier animation)
  it("returns a shorter duration for a faster flow rate", () => {
    const slowDur = flowRateToAnimDur(300);
    const fastDur = flowRateToAnimDur(1500);
    expect(fastDur).toBeLessThan(slowDur);
  });

  it("clamps output to minimum of 1s for very high flow rates", () => {
    expect(flowRateToAnimDur(99999)).toBe(1);
  });

  it("clamps output to maximum of 6s for zero or very low flow rates", () => {
    expect(flowRateToAnimDur(0)).toBe(6);
    expect(flowRateToAnimDur(-100)).toBe(6);
  });

  it("returns a value within [1, 6] for the domain boundary rates (300 and 1500 m³/h)", () => {
    const atMin = flowRateToAnimDur(300);
    const atMax = flowRateToAnimDur(1500);
    expect(atMin).toBeGreaterThanOrEqual(1);
    expect(atMin).toBeLessThanOrEqual(6);
    expect(atMax).toBeGreaterThanOrEqual(1);
    expect(atMax).toBeLessThanOrEqual(6);
  });

  it("returns exactly 6 at the domain minimum rate (300 m³/h maps to slowest animation)", () => {
    // 300 m³/h is the domain minimum — flow is slow so animation is slow (dur=6s)
    expect(flowRateToAnimDur(300)).toBe(6);
  });

  it("returns exactly 1 at the domain maximum rate (1500 m³/h maps to fastest animation)", () => {
    // 1500 m³/h is the domain maximum — flow is fast so animation is fast (dur=1s)
    expect(flowRateToAnimDur(1500)).toBe(1);
  });
});
