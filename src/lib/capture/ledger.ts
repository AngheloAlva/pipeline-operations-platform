/**
 * Ledger / amendment model (MV-8).
 *
 * Ledger-book semantics over captured records (PLAN_MEJORAS_VENTA §6.2):
 * a correction NEVER overwrites. amendRecord() produces a NEW record whose
 * captureMeta.supersedesId points at the original, and previousValue carries
 * the old values of the changed fields for the audit trail. The original
 * record is never mutated.
 *
 * All functions are pure and generic over any record shape that carries an
 * `id` and an optional `captureMeta` (Movement, tank readings, shift notes…).
 */

import type { CaptureMeta } from "@/lib/domain";

// ============================================================================
// TYPES
// ============================================================================

/** Minimal shape of a record the ledger can manage. */
export interface CapturedRecord {
  id: string;
  captureMeta?: CaptureMeta;
}

/** Provenance for one amendment (who / where / when + the new record's id). */
export interface AmendmentMeta {
  /** ID assigned to the NEW (amending) record. */
  newRecordId: string;
  authorId: string;
  workstationId: string;
  /** ISO 8601 timestamp when the amendment was entered. */
  enteredAt: string;
}

// ============================================================================
// amendRecord
// ============================================================================

/**
 * Create a NEW record that supersedes `original`, applying `newValues` on top.
 *
 * - The returned record gets `meta.newRecordId` and a fresh captureMeta whose
 *   `supersedesId` points at the original.
 * - `previousValue` snapshots the original values of exactly the fields that
 *   `newValues` touches (the audit trail of what changed).
 * - The original record is never mutated.
 */
export function amendRecord<T extends CapturedRecord>(
  original: T,
  newValues: Partial<Omit<T, "id" | "captureMeta">>,
  meta: AmendmentMeta,
): T {
  const previousValue: Record<string, unknown> = {};
  for (const key of Object.keys(newValues)) {
    previousValue[key] = (original as Record<string, unknown>)[key];
  }

  const captureMeta: CaptureMeta = {
    authorId: meta.authorId,
    enteredAt: meta.enteredAt,
    workstationId: meta.workstationId,
    supersedesId: original.id,
    previousValue,
  };

  return {
    ...original,
    ...newValues,
    id: meta.newRecordId,
    captureMeta,
  };
}

// ============================================================================
// getAmendmentTrail
// ============================================================================

/**
 * Full amendment chain containing `recordId`, ordered oldest → newest.
 * Works when queried by any member of the chain. Returns [] for unknown ids.
 * Cycle-safe (a malformed chain cannot loop forever).
 */
export function getAmendmentTrail<T extends CapturedRecord>(
  records: T[],
  recordId: string,
): T[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const start = byId.get(recordId);
  if (!start) return [];

  const visited = new Set<string>([start.id]);

  // Walk backwards to the oldest record of the chain.
  let oldest = start;
  while (oldest.captureMeta?.supersedesId) {
    const prev = byId.get(oldest.captureMeta.supersedesId);
    if (!prev || visited.has(prev.id)) break;
    visited.add(prev.id);
    oldest = prev;
  }

  // Walk forwards from the oldest, following supersedesId references.
  const trail: T[] = [oldest];
  const seen = new Set<string>([oldest.id]);
  let current = oldest;
  for (;;) {
    const next = records.find((r) => r.captureMeta?.supersedesId === current.id);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    trail.push(next);
    current = next;
  }

  return trail;
}

// ============================================================================
// getEffectiveRecords / isSuperseded
// ============================================================================

/**
 * Records that are currently in force: every record NOT superseded by a later
 * amendment. Standalone records and chain heads survive; amended originals
 * and intermediate corrections are filtered out.
 */
export function getEffectiveRecords<T extends CapturedRecord>(records: T[]): T[] {
  const supersededIds = new Set<string>();
  for (const record of records) {
    const supersedesId = record.captureMeta?.supersedesId;
    if (supersedesId) supersededIds.add(supersedesId);
  }
  return records.filter((r) => !supersededIds.has(r.id));
}

/** True when a later record supersedes `recordId`. */
export function isSuperseded<T extends CapturedRecord>(records: T[], recordId: string): boolean {
  return records.some((r) => r.captureMeta?.supersedesId === recordId);
}
