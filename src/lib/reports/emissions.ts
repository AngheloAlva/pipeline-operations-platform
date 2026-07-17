/**
 * GHG emission report aggregation (MV-18).
 * Absorbs the "Medio Ambiente" section of the monthly BI report: per-month
 * tCO₂e series plus breakdowns by GHG Protocol scope and by emission source.
 *
 * Pure functions — no side effects, no store imports, no React dependencies.
 */

import type { EmissionEntry } from "@/lib/domain";
import { EmissionScope } from "@/lib/domain";

// ============================================================================
// TYPES
// ============================================================================

/** One month of the emission series. */
export interface EmissionMonthRow {
  /** Period, "YYYY-MM". */
  period: string;
  /** Total emissions in the month, tCO₂e. */
  totalTons: number;
  /** Per-scope emissions (0 for scopes without entries in the month). */
  byScope: Record<EmissionScope, number>;
}

/** Aggregated emissions for one breakdown key (scope or source). */
export interface EmissionBreakdownRow {
  key: string;
  totalTons: number;
  /** Share of the grand total (%; 0 when the total is 0). */
  sharePct: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** GHG Protocol display order. */
const SCOPE_ORDER: EmissionScope[] = [
  EmissionScope.SCOPE_1,
  EmissionScope.SCOPE_2,
  EmissionScope.SCOPE_3,
];

function emptyByScope(): Record<EmissionScope, number> {
  return {
    [EmissionScope.SCOPE_1]: 0,
    [EmissionScope.SCOPE_2]: 0,
    [EmissionScope.SCOPE_3]: 0,
  };
}

/**
 * Total tCO₂e per month with a per-scope breakdown, sorted ascending by
 * period. Scopes without entries in a month stay at 0 — sparse seed months
 * are never fabricated.
 */
export function buildEmissionMonthlySeries(entries: EmissionEntry[]): EmissionMonthRow[] {
  const byPeriod = new Map<string, EmissionEntry[]>();
  for (const entry of entries) {
    const list = byPeriod.get(entry.period) ?? [];
    list.push(entry);
    byPeriod.set(entry.period, list);
  }

  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, group]) => {
      const byScope = emptyByScope();
      for (const entry of group) {
        byScope[entry.scope] += entry.tonsCo2e;
      }
      return {
        period,
        totalTons: group.reduce((sum, e) => sum + e.tonsCo2e, 0),
        byScope,
      };
    });
}

/** Shared breakdown builder: total + share per key, in the given key order. */
function buildBreakdown(
  entries: EmissionEntry[],
  keys: string[],
  keyOf: (entry: EmissionEntry) => string,
): EmissionBreakdownRow[] {
  const grandTotal = entries.reduce((sum, e) => sum + e.tonsCo2e, 0);

  return keys.flatMap((key) => {
    const group = entries.filter((e) => keyOf(e) === key);
    if (group.length === 0) return [];
    const totalTons = group.reduce((sum, e) => sum + e.tonsCo2e, 0);
    return [
      {
        key,
        totalTons,
        sharePct: grandTotal !== 0 ? (totalTons / grandTotal) * 100 : 0,
      },
    ];
  });
}

/**
 * Breakdown per GHG Protocol scope (Scope 1, 2, 3 order), with each scope's
 * share of the grand total. Scopes without entries are omitted.
 */
export function summarizeEmissionsByScope(entries: EmissionEntry[]): EmissionBreakdownRow[] {
  return buildBreakdown(entries, SCOPE_ORDER, (e) => e.scope);
}

/**
 * Breakdown per emission source, largest emitter first (ton ties broken by
 * source name for deterministic output).
 */
export function summarizeEmissionsBySource(entries: EmissionEntry[]): EmissionBreakdownRow[] {
  const sources = [...new Set(entries.map((e) => e.source))];
  return buildBreakdown(entries, sources, (e) => e.source).sort(
    (a, b) => b.totalTons - a.totalTons || a.key.localeCompare(b.key),
  );
}
