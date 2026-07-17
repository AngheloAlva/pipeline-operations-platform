/**
 * Tests for lib/reports/closings — monthly closing comments grouping (MV-18).
 * The closings report groups the per-area closing comments by period,
 * most recent month first, with a deterministic area order inside each group.
 */

import { describe, it, expect } from "vitest";
import type { ClosingComment } from "@/lib/domain";
import { groupClosingsByPeriod } from "./closings";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function comment(
  id: string,
  period: string,
  area: string,
  text = `Cierre ${period} — ${area}`,
  authorId?: string,
): ClosingComment {
  return { id, period, area, comment: text, authorId };
}

const COMMENTS: ClosingComment[] = [
  comment("CLC-1", "2026-05", "Operaciones", "Sin desviaciones.", "OPR-1"),
  comment("CLC-2", "2026-06", "Mantenimiento", "Plan al día.", "OPR-2"),
  comment("CLC-3", "2026-05", "Integridad", "Potenciales en banda."),
  comment("CLC-4", "2026-06", "Operaciones", "Bombeo estable.", "OPR-1"),
];

// ---------------------------------------------------------------------------
// groupClosingsByPeriod
// ---------------------------------------------------------------------------

describe("groupClosingsByPeriod", () => {
  it("groups comments by period, most recent month first", () => {
    const groups = groupClosingsByPeriod(COMMENTS);
    expect(groups.map((g) => g.period)).toEqual(["2026-06", "2026-05"]);
    expect(groups[0].comments).toHaveLength(2);
    expect(groups[1].comments).toHaveLength(2);
  });

  it("sorts comments inside each group by area (deterministic)", () => {
    const groups = groupClosingsByPeriod(COMMENTS);
    expect(groups[0].comments.map((c) => c.area)).toEqual([
      "Mantenimiento",
      "Operaciones",
    ]);
    expect(groups[1].comments.map((c) => c.area)).toEqual([
      "Integridad",
      "Operaciones",
    ]);
  });

  it("keeps optional authors untouched (present or absent)", () => {
    const groups = groupClosingsByPeriod(COMMENTS);
    const may = groups.find((g) => g.period === "2026-05");
    const integrity = may?.comments.find((c) => c.area === "Integridad");
    const operations = may?.comments.find((c) => c.area === "Operaciones");
    expect(integrity?.authorId).toBeUndefined();
    expect(operations?.authorId).toBe("OPR-1");
  });

  it("returns an empty list for no comments", () => {
    expect(groupClosingsByPeriod([])).toEqual([]);
  });
});
