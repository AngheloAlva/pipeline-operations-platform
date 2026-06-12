/**
 * Pure SVG layout helpers for the FlowDiagram component.
 * SR-005 req 2 (data-derived positions), SR-014 (no hardcoded km values).
 * No side effects, no store imports, no React dependencies.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StationLayoutEntry {
  stationId: string;
  x: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface EdgeEntry {
  fromNodeId: string;
  toNodeId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ============================================================================
// kmToX — map a kilometer value to an SVG x-coordinate
// ============================================================================

/**
 * Map a `km` value within [minKm, maxKm] to an SVG x coordinate within
 * [padding, viewWidth - padding].
 *
 * @param km         The kilometer position to convert.
 * @param minKm      The minimum km in the world (leftmost station).
 * @param maxKm      The maximum km in the world (rightmost station).
 * @param viewWidth  The SVG viewBox width.
 * @param padding    Left/right padding in SVG units.
 */
export function kmToX(
  km: number,
  minKm: number,
  maxKm: number,
  viewWidth: number,
  padding: number,
): number {
  const span = maxKm - minKm;
  if (span === 0) return padding;

  const usable = viewWidth - 2 * padding;
  const ratio = Math.max(0, Math.min(1, (km - minKm) / span));
  return padding + ratio * usable;
}

// ============================================================================
// buildStationLayout — compute x positions for all stations
// ============================================================================

interface StationLike {
  id: string;
  km: number;
  name?: string;
}

/**
 * Build a layout entry (x position) for each station, sorted by km ascending.
 *
 * @param stations   Array of station-like objects with id and km.
 * @param viewWidth  SVG viewBox width.
 * @param padding    Left/right padding in SVG units.
 */
export function buildStationLayout(
  stations: StationLike[],
  viewWidth: number,
  padding: number,
): StationLayoutEntry[] {
  if (stations.length === 0) return [];

  const sorted = [...stations].sort((a, b) => a.km - b.km);
  const minKm = sorted[0].km;
  const maxKm = sorted[sorted.length - 1].km;

  return sorted.map((s) => ({
    stationId: s.id,
    x: kmToX(s.km, minKm, maxKm, viewWidth, padding),
  }));
}

// ============================================================================
// buildEdges — compute edge entries from activeFlows and node positions
// ============================================================================

interface ActiveFlowLike {
  fromNodeId: string;
  toNodeId: string;
  flowRateM3h: number;
}

/**
 * Build edge render entries from activeFlows.
 * Deduplicates identical fromNodeId/toNodeId pairs.
 * Omits edges where either endpoint has no position in nodePositions.
 *
 * @param activeFlows    Current active flows.
 * @param nodePositions  Map of nodeId → {x, y}.
 */
export function buildEdges(
  activeFlows: ActiveFlowLike[],
  nodePositions: Record<string, NodePosition>,
): EdgeEntry[] {
  const seen = new Set<string>();
  const edges: EdgeEntry[] = [];

  for (const flow of activeFlows) {
    const key = `${flow.fromNodeId}→${flow.toNodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const from = nodePositions[flow.fromNodeId];
    const to = nodePositions[flow.toNodeId];
    if (!from || !to) continue;

    edges.push({
      fromNodeId: flow.fromNodeId,
      toNodeId: flow.toNodeId,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });
  }

  return edges;
}
