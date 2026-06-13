/**
 * Pure entity resolution for cross-module focus synchronization.
 * F4-1-R1: resolveEntity(world, id) → ResolvedEntity | null.
 *
 * Resolution order: equipment → tanks → stations → cathodic composite key → null.
 * Collection membership is authoritative; prefix parsing is NOT used.
 * No React/store imports — pure function safe for unit tests and server-side use.
 */
import type { PipelineWorld } from "@/lib/domain/types";
import { EntityType } from "@/store/selectionStore";
import { pointKey } from "@/lib/integrity/selectors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Flat resolved entity: universal bridge carrying stationId for cross-module navigation. */
export interface ResolvedEntity {
  id: string;
  type: (typeof EntityType)[keyof typeof EntityType];
  /** Station that owns this entity; null when entity has no station FK. */
  stationId: string | null;
}

// ---------------------------------------------------------------------------
// Private probe helpers
// ---------------------------------------------------------------------------

function findEquipment(world: PipelineWorld, id: string): ResolvedEntity | null {
  const e = world.equipment.find((eq) => eq.id === id);
  if (!e) return null;
  return { id: e.id, type: EntityType.EQUIPMENT, stationId: e.stationId };
}

function findTank(world: PipelineWorld, id: string): ResolvedEntity | null {
  const t = world.tanks.find((tk) => tk.id === id);
  if (!t) return null;
  return { id: t.id, type: EntityType.TANK, stationId: t.stationId };
}

function findStation(world: PipelineWorld, id: string): ResolvedEntity | null {
  const s = world.stations.find((st) => st.id === id);
  if (!s) return null;
  // A station's stationId is itself — it is its own anchor.
  return { id: s.id, type: EntityType.STATION, stationId: s.id };
}

function findCathodicPoint(world: PipelineWorld, id: string): ResolvedEntity | null {
  // Composite key: "km:segmentId" — ':' separator distinguishes from STA-/TNK-/EQP- ids.
  if (!id.includes(":")) return null;
  const r = world.cathodicReadings.find((reading) => pointKey(reading.km, reading.segmentId) === id);
  if (!r) return null;
  // stationId is optional on CathodicReading; coerce undefined → null per spec.
  return { id, type: EntityType.CATHODIC_POINT, stationId: r.stationId ?? null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve any entity id string to its type and stationId from the world state.
 *
 * @param world - The complete pipeline world state.
 * @param id - Any entity id (STA-, TNK-, EQP-, or composite cathodic key).
 * @returns ResolvedEntity if found, null if id is unknown or empty.
 */
export function resolveEntity(world: PipelineWorld, id: string): ResolvedEntity | null {
  if (!id) return null;

  return (
    findEquipment(world, id) ??
    findTank(world, id) ??
    findStation(world, id) ??
    findCathodicPoint(world, id) ??
    null
  );
}
