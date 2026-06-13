/**
 * Pure URL helpers for the ?focus= search parameter.
 * F4-1-R2/R3: parse, serialize, and build focus hrefs for cross-module navigation.
 *
 * No React/store/router imports — these are pure functions safe for unit tests.
 */
import { EntityType } from "@/store/selectionStore";
import type { ResolvedEntity } from "@/lib/domain/resolveEntity";

// ---------------------------------------------------------------------------
// Module path keys (const-object pattern per TypeScript skill)
// ---------------------------------------------------------------------------

export const MODULE_PATH = {
  cockpit: "/cockpit",
  maintenance: "/maintenance",
  integrity: "/integrity",
  equipment: "/equipment",
} as const;

export type ModuleKey = keyof typeof MODULE_PATH;

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse a raw URL search param value into an entity id string.
 * Returns null when the value is absent, empty, or not a non-empty string.
 *
 * @param value - Raw value from URLSearchParams.get("focus") or equivalent.
 */
export function parseFocusParam(value: string | null | undefined): string | null {
  if (!value) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize an entity id for use as the ?focus= param value.
 * Returns the raw id string unchanged (no encoding needed — entity ids are URL-safe).
 *
 * @param entityId - A valid entity id (STA-, TNK-, EQP-, or composite km:segmentId).
 */
export function serializeFocusParam(entityId: string): string {
  return entityId;
}

// ---------------------------------------------------------------------------
// Build href (bridge mapping)
// ---------------------------------------------------------------------------

/**
 * Build the navigation href for a given entity navigating to a target module.
 * Encodes entity-type mismatch bridge rules: the ?focus= value depends on what
 * the target module expects, not just the entity's own id.
 *
 * Returns null when:
 * - The entity has no stationId and the target module requires one (CATHODIC_POINT edge case).
 *
 * @param entity - Resolved entity (id, type, stationId).
 * @param target - Target module key.
 */
export function buildFocusHref(entity: ResolvedEntity, target: ModuleKey): string | null {
  const { id, type, stationId } = entity;

  if (type === EntityType.EQUIPMENT) {
    // Equipment hub: /equipment/<id> — no ?focus=
    if (target === "equipment") return `${MODULE_PATH.equipment}/${id}`;
    // Maintenance uses equipment id directly (natively selects equipment)
    if (target === "maintenance") return `${MODULE_PATH.maintenance}?focus=${id}`;
    // Cockpit and Integrity navigate to the station context
    if (target === "cockpit") return `${MODULE_PATH.cockpit}?focus=${stationId}`;
    if (target === "integrity") return `${MODULE_PATH.integrity}?focus=${stationId}`;
  }

  if (type === EntityType.TANK || type === EntityType.STATION) {
    // Cockpit: navigate to the entity itself (tank or station)
    if (target === "cockpit") return `${MODULE_PATH.cockpit}?focus=${id}`;
    // Maintenance and Integrity: bridge via stationId
    if (target === "maintenance") return `${MODULE_PATH.maintenance}?focus=${stationId}`;
    if (target === "integrity") return `${MODULE_PATH.integrity}?focus=${stationId}`;
  }

  if (type === EntityType.CATHODIC_POINT) {
    // All cross-module links require stationId; if null → suppress (never emit ?focus=null)
    if (!stationId) return null;
    if (target === "cockpit") return `${MODULE_PATH.cockpit}?focus=${stationId}`;
    if (target === "maintenance") return `${MODULE_PATH.maintenance}?focus=${stationId}`;
    if (target === "integrity") return `${MODULE_PATH.integrity}?focus=${stationId}`;
  }

  return null;
}
