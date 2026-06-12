/**
 * TDD — SVG layout helpers for FlowDiagram.
 * RED phase: tests written before implementation.
 * SR-005 req 2 (data-derived positions), SR-014 (no hardcoded values).
 */

import { describe, it, expect } from "vitest";
import { kmToX, buildStationLayout, buildEdges } from "./layout";

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
