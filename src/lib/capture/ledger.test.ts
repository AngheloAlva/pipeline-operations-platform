/**
 * Unit tests for the ledger / amendment model (MV-8).
 * Ledger-book semantics: a correction NEVER overwrites — it creates a new
 * record pointing at the superseded one via captureMeta.supersedesId.
 */

import { describe, it, expect } from "vitest";
import {
  amendRecord,
  getAmendmentTrail,
  getEffectiveRecords,
  isSuperseded,
} from "./ledger";
import type { CapturedRecord } from "./ledger";
import type { CaptureMeta } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Fixture records
// ---------------------------------------------------------------------------

interface ReadingRecord extends CapturedRecord {
  tankId: string;
  levelM3: number;
}

function meta(overrides?: Partial<CaptureMeta>): CaptureMeta {
  return {
    authorId: "OPR-0580",
    enteredAt: "2026-06-12T10:00:00.000Z",
    workstationId: "WST-0585",
    ...overrides,
  };
}

function makeOriginal(): ReadingRecord {
  return {
    id: "CAP-0001",
    tankId: "TNK-1",
    levelM3: 18_000,
    captureMeta: meta(),
  };
}

// ---------------------------------------------------------------------------
// amendRecord
// ---------------------------------------------------------------------------

describe("amendRecord", () => {
  it("creates a NEW record with supersedesId pointing at the original", () => {
    const original = makeOriginal();
    const amended = amendRecord(
      original,
      { levelM3: 18_450 },
      {
        newRecordId: "CAP-0002",
        authorId: "OPR-0581",
        workstationId: "WST-0585",
        enteredAt: "2026-06-12T11:00:00.000Z",
      },
    );

    expect(amended).not.toBe(original);
    expect(amended.id).toBe("CAP-0002");
    expect(amended.levelM3).toBe(18_450);
    // Unchanged fields carry over
    expect(amended.tankId).toBe("TNK-1");
    // Amendment envelope
    expect(amended.captureMeta?.supersedesId).toBe("CAP-0001");
    expect(amended.captureMeta?.authorId).toBe("OPR-0581");
    expect(amended.captureMeta?.enteredAt).toBe("2026-06-12T11:00:00.000Z");
  });

  it("carries the previous value of the changed fields in previousValue", () => {
    const original = makeOriginal();
    const amended = amendRecord(
      original,
      { levelM3: 18_450 },
      {
        newRecordId: "CAP-0002",
        authorId: "OPR-0581",
        workstationId: "WST-0585",
        enteredAt: "2026-06-12T11:00:00.000Z",
      },
    );
    expect(amended.captureMeta?.previousValue).toEqual({ levelM3: 18_000 });
  });

  it("never mutates the original record (frozen original does not throw)", () => {
    const original = Object.freeze(makeOriginal());
    expect(() =>
      amendRecord(
        original,
        { levelM3: 19_000 },
        {
          newRecordId: "CAP-0002",
          authorId: "OPR-0580",
          workstationId: "WST-0585",
          enteredAt: "2026-06-12T11:00:00.000Z",
        },
      ),
    ).not.toThrow();
    expect(original.levelM3).toBe(18_000);
    expect(original.id).toBe("CAP-0001");
    expect(original.captureMeta?.supersedesId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Trail + effective set fixtures — a chain CAP-1 → CAP-2 → CAP-3 plus an
// unrelated record CAP-0.
// ---------------------------------------------------------------------------

function makeChain(): ReadingRecord[] {
  const r0: ReadingRecord = {
    id: "CAP-0",
    tankId: "TNK-2",
    levelM3: 27_500,
    captureMeta: meta(),
  };
  const r1 = makeOriginal(); // CAP-0001
  const r2 = amendRecord(
    r1,
    { levelM3: 18_450 },
    {
      newRecordId: "CAP-0002",
      authorId: "OPR-0581",
      workstationId: "WST-0585",
      enteredAt: "2026-06-12T11:00:00.000Z",
    },
  );
  const r3 = amendRecord(
    r2,
    { levelM3: 18_500 },
    {
      newRecordId: "CAP-0003",
      authorId: "OPR-0580",
      workstationId: "WST-0585",
      enteredAt: "2026-06-12T12:00:00.000Z",
    },
  );
  // Deliberately shuffled order — helpers must not rely on array order
  return [r3, r0, r1, r2];
}

// ---------------------------------------------------------------------------
// getAmendmentTrail
// ---------------------------------------------------------------------------

describe("getAmendmentTrail", () => {
  it("returns the full chain oldest → newest when queried by the newest id", () => {
    const records = makeChain();
    const trail = getAmendmentTrail(records, "CAP-0003");
    expect(trail.map((r) => r.id)).toEqual(["CAP-0001", "CAP-0002", "CAP-0003"]);
  });

  it("returns the same full chain when queried by the oldest or a middle id", () => {
    const records = makeChain();
    expect(getAmendmentTrail(records, "CAP-0001").map((r) => r.id)).toEqual([
      "CAP-0001",
      "CAP-0002",
      "CAP-0003",
    ]);
    expect(getAmendmentTrail(records, "CAP-0002").map((r) => r.id)).toEqual([
      "CAP-0001",
      "CAP-0002",
      "CAP-0003",
    ]);
  });

  it("returns a single-element trail for a record with no amendments", () => {
    const records = makeChain();
    expect(getAmendmentTrail(records, "CAP-0").map((r) => r.id)).toEqual(["CAP-0"]);
  });

  it("returns an empty trail for an unknown record id", () => {
    expect(getAmendmentTrail(makeChain(), "CAP-404")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getEffectiveRecords / isSuperseded
// ---------------------------------------------------------------------------

describe("getEffectiveRecords", () => {
  it("excludes superseded records, keeping only the latest of each chain", () => {
    const records = makeChain();
    const effective = getEffectiveRecords(records);
    const ids = effective.map((r) => r.id);
    expect(ids).toContain("CAP-0003");
    expect(ids).toContain("CAP-0");
    expect(ids).not.toContain("CAP-0001");
    expect(ids).not.toContain("CAP-0002");
    expect(effective).toHaveLength(2);
  });
});

describe("isSuperseded", () => {
  it("flags superseded records and leaves chain heads and standalone records alone", () => {
    const records = makeChain();
    expect(isSuperseded(records, "CAP-0001")).toBe(true);
    expect(isSuperseded(records, "CAP-0002")).toBe(true);
    expect(isSuperseded(records, "CAP-0003")).toBe(false);
    expect(isSuperseded(records, "CAP-0")).toBe(false);
  });
});
