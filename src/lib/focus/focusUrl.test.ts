/**
 * Tests for src/lib/focus/focusUrl.ts — strict TDD, RED written first.
 * Covers parseFocusParam, serializeFocusParam, buildFocusHref per F4-1-R2/R3.
 * All module × entity-type bridge mappings tested including null-stationId suppression.
 */
import { describe, it, expect } from "vitest";
import { EntityType } from "@/store/selectionStore";
import type { ResolvedEntity } from "@/lib/domain/resolveEntity";

// Implementation expected at this path — will fail RED until T1-5 is done
import { parseFocusParam, serializeFocusParam, buildFocusHref } from "./focusUrl";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(
  overrides: Partial<ResolvedEntity> & { type: ResolvedEntity["type"] },
): ResolvedEntity {
  return {
    id: "EQP-0012",
    stationId: "STA-0005",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseFocusParam
// ---------------------------------------------------------------------------

describe("parseFocusParam", () => {
  it("returns the string when present and non-empty", () => {
    expect(parseFocusParam("EQP-0012")).toBe("EQP-0012");
  });

  it("returns the string for cathodic composite key", () => {
    expect(parseFocusParam("100:SEG-001")).toBe("100:SEG-001");
  });

  it("returns null for empty string", () => {
    expect(parseFocusParam("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseFocusParam(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseFocusParam(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// serializeFocusParam
// ---------------------------------------------------------------------------

describe("serializeFocusParam", () => {
  it("returns the raw entity id unchanged", () => {
    expect(serializeFocusParam("EQP-0012")).toBe("EQP-0012");
  });

  it("returns cathodic composite key unchanged", () => {
    expect(serializeFocusParam("100:SEG-001")).toBe("100:SEG-001");
  });

  it("returns station id unchanged", () => {
    expect(serializeFocusParam("STA-0005")).toBe("STA-0005");
  });
});

// ---------------------------------------------------------------------------
// buildFocusHref — EQUIPMENT entity
// ---------------------------------------------------------------------------

describe("buildFocusHref — EQUIPMENT entity", () => {
  const entity = makeEntity({ type: EntityType.EQUIPMENT, id: "EQP-0012", stationId: "STA-0005" });

  it("EQUIPMENT × cockpit → /cockpit?focus=<stationId>", () => {
    expect(buildFocusHref(entity, "cockpit")).toBe("/cockpit?focus=STA-0005");
  });

  it("EQUIPMENT × maintenance → /maintenance?focus=<id> (equipment id)", () => {
    expect(buildFocusHref(entity, "maintenance")).toBe("/maintenance?focus=EQP-0012");
  });

  it("EQUIPMENT × integrity → /integrity?focus=<stationId>", () => {
    expect(buildFocusHref(entity, "integrity")).toBe("/integrity?focus=STA-0005");
  });

  it("EQUIPMENT × equipment → /equipment/<id> (hub link)", () => {
    expect(buildFocusHref(entity, "equipment")).toBe("/equipment/EQP-0012");
  });
});

// ---------------------------------------------------------------------------
// buildFocusHref — TANK entity
// ---------------------------------------------------------------------------

describe("buildFocusHref — TANK entity", () => {
  const entity = makeEntity({ type: EntityType.TANK, id: "TNK-0001", stationId: "STA-0001" });

  it("TANK × cockpit → /cockpit?focus=<id> (tank itself)", () => {
    expect(buildFocusHref(entity, "cockpit")).toBe("/cockpit?focus=TNK-0001");
  });

  it("TANK × maintenance → /maintenance?focus=<stationId>", () => {
    expect(buildFocusHref(entity, "maintenance")).toBe("/maintenance?focus=STA-0001");
  });

  it("TANK × integrity → /integrity?focus=<stationId>", () => {
    expect(buildFocusHref(entity, "integrity")).toBe("/integrity?focus=STA-0001");
  });
});

// ---------------------------------------------------------------------------
// buildFocusHref — STATION entity
// ---------------------------------------------------------------------------

describe("buildFocusHref — STATION entity", () => {
  const entity = makeEntity({ type: EntityType.STATION, id: "STA-0005", stationId: "STA-0005" });

  it("STATION × cockpit → /cockpit?focus=<id>", () => {
    expect(buildFocusHref(entity, "cockpit")).toBe("/cockpit?focus=STA-0005");
  });

  it("STATION × maintenance → /maintenance?focus=<stationId>", () => {
    expect(buildFocusHref(entity, "maintenance")).toBe("/maintenance?focus=STA-0005");
  });

  it("STATION × integrity → /integrity?focus=<stationId>", () => {
    expect(buildFocusHref(entity, "integrity")).toBe("/integrity?focus=STA-0005");
  });
});

// ---------------------------------------------------------------------------
// buildFocusHref — CATHODIC_POINT entity
// ---------------------------------------------------------------------------

describe("buildFocusHref — CATHODIC_POINT entity", () => {
  const entityWithStation = makeEntity({
    type: EntityType.CATHODIC_POINT,
    id: "100:SEG-001",
    stationId: "STA-0007",
  });

  const entityNoStation = makeEntity({
    type: EntityType.CATHODIC_POINT,
    id: "200:SEG-002",
    stationId: null,
  });

  it("CATHODIC_POINT × cockpit → /cockpit?focus=<stationId> when stationId is known", () => {
    expect(buildFocusHref(entityWithStation, "cockpit")).toBe("/cockpit?focus=STA-0007");
  });

  it("CATHODIC_POINT × maintenance → /maintenance?focus=<stationId> when stationId is known", () => {
    expect(buildFocusHref(entityWithStation, "maintenance")).toBe("/maintenance?focus=STA-0007");
  });

  it("CATHODIC_POINT with null stationId × cockpit → null (must not emit ?focus=null)", () => {
    expect(buildFocusHref(entityNoStation, "cockpit")).toBeNull();
  });

  it("CATHODIC_POINT with null stationId × maintenance → null", () => {
    expect(buildFocusHref(entityNoStation, "maintenance")).toBeNull();
  });

  it("CATHODIC_POINT × integrity → /integrity?focus=<stationId> when stationId is known", () => {
    // Per design: cathodic is already IN integrity; this path is exclude-handled at component level
    // but buildFocusHref for cathodic×integrity: use stationId if known
    expect(buildFocusHref(entityWithStation, "integrity")).toBe("/integrity?focus=STA-0007");
  });

  it("CATHODIC_POINT × integrity × null stationId → null", () => {
    expect(buildFocusHref(entityNoStation, "integrity")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildFocusHref — exclude own module (null result)
// ---------------------------------------------------------------------------

describe("buildFocusHref — module self-exclusion sentinel", () => {
  // The component handles exclude via the `exclude` prop; buildFocusHref itself
  // does NOT perform exclusion — it always returns the href or null for missing stationId.
  // This test documents the behavior: buildFocusHref does not know which module the user is on.
  it("returns a valid href even for same-module target (component excludes via prop)", () => {
    const entity = makeEntity({ type: EntityType.STATION, id: "STA-0005", stationId: "STA-0005" });
    expect(buildFocusHref(entity, "cockpit")).not.toBeNull();
  });
});
