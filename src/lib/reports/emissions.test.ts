/**
 * Tests for lib/reports/emissions — GHG emission aggregation (MV-18).
 * The environment report shows the per-month tCO₂e series plus breakdowns
 * by GHG Protocol scope and by emission source.
 */

import { describe, it, expect } from "vitest";
import type { EmissionEntry } from "@/lib/domain";
import { EmissionScope } from "@/lib/domain";
import {
  buildEmissionMonthlySeries,
  summarizeEmissionsByScope,
  summarizeEmissionsBySource,
} from "./emissions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function entry(
  id: string,
  period: string,
  scope: EmissionScope,
  tonsCo2e: number,
  source: string,
): EmissionEntry {
  return { id, period, scope, tonsCo2e, source };
}

const ENTRIES: EmissionEntry[] = [
  entry("EMI-1", "2026-05", EmissionScope.SCOPE_1, 1200, "Combustión en bombas"),
  entry("EMI-2", "2026-05", EmissionScope.SCOPE_2, 400, "Energía eléctrica comprada"),
  entry("EMI-3", "2026-05", EmissionScope.SCOPE_3, 100, "Transporte contratado"),
  entry("EMI-4", "2026-04", EmissionScope.SCOPE_1, 1000, "Combustión en bombas"),
  entry("EMI-5", "2026-04", EmissionScope.SCOPE_2, 300, "Energía eléctrica comprada"),
];

// ---------------------------------------------------------------------------
// buildEmissionMonthlySeries
// ---------------------------------------------------------------------------

describe("buildEmissionMonthlySeries", () => {
  it("totals tCO₂e per month with a per-scope breakdown, ascending by period", () => {
    const rows = buildEmissionMonthlySeries(ENTRIES);
    expect(rows).toHaveLength(2);

    const [april, may] = rows;
    expect(april.period).toBe("2026-04");
    expect(april.totalTons).toBeCloseTo(1300);
    expect(april.byScope[EmissionScope.SCOPE_1]).toBeCloseTo(1000);
    expect(april.byScope[EmissionScope.SCOPE_2]).toBeCloseTo(300);
    // Missing scope defaults to 0 (sparse months never fabricate data)
    expect(april.byScope[EmissionScope.SCOPE_3]).toBe(0);

    expect(may.period).toBe("2026-05");
    expect(may.totalTons).toBeCloseTo(1700);
    expect(may.byScope[EmissionScope.SCOPE_3]).toBeCloseTo(100);
  });

  it("returns an empty series for no entries", () => {
    expect(buildEmissionMonthlySeries([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeEmissionsByScope
// ---------------------------------------------------------------------------

describe("summarizeEmissionsByScope", () => {
  it("totals tCO₂e and share per scope in GHG Protocol order", () => {
    const rows = summarizeEmissionsByScope(ENTRIES);
    expect(rows.map((r) => r.key)).toEqual([
      EmissionScope.SCOPE_1,
      EmissionScope.SCOPE_2,
      EmissionScope.SCOPE_3,
    ]);

    const [scope1, scope2, scope3] = rows;
    expect(scope1.totalTons).toBeCloseTo(2200);
    // 2 200 / 3 000 grand total = 73.33 %
    expect(scope1.sharePct).toBeCloseTo((2200 / 3000) * 100);
    expect(scope2.totalTons).toBeCloseTo(700);
    expect(scope3.totalTons).toBeCloseTo(100);
  });

  it("omits scopes without entries", () => {
    const rows = summarizeEmissionsByScope([ENTRIES[1]]);
    expect(rows.map((r) => r.key)).toEqual([EmissionScope.SCOPE_2]);
    expect(rows[0].sharePct).toBeCloseTo(100);
  });

  it("yields 0 % shares when the grand total is 0 (no division by zero)", () => {
    const rows = summarizeEmissionsByScope([
      entry("EMI-z", "2026-05", EmissionScope.SCOPE_1, 0, "Fuente"),
    ]);
    expect(rows[0].sharePct).toBe(0);
  });

  it("returns an empty breakdown for no entries", () => {
    expect(summarizeEmissionsByScope([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeEmissionsBySource
// ---------------------------------------------------------------------------

describe("summarizeEmissionsBySource", () => {
  it("totals tCO₂e and share per source, largest emitter first", () => {
    const rows = summarizeEmissionsBySource(ENTRIES);
    expect(rows.map((r) => r.key)).toEqual([
      "Combustión en bombas",
      "Energía eléctrica comprada",
      "Transporte contratado",
    ]);
    expect(rows[0].totalTons).toBeCloseTo(2200);
    expect(rows[0].sharePct).toBeCloseTo((2200 / 3000) * 100);
  });

  it("breaks ton ties deterministically by source name", () => {
    const rows = summarizeEmissionsBySource([
      entry("EMI-a", "2026-05", EmissionScope.SCOPE_1, 500, "Fuente B"),
      entry("EMI-b", "2026-05", EmissionScope.SCOPE_1, 500, "Fuente A"),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["Fuente A", "Fuente B"]);
  });

  it("returns an empty breakdown for no entries", () => {
    expect(summarizeEmissionsBySource([])).toEqual([]);
  });
});
