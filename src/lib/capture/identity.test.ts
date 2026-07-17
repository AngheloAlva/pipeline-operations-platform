/**
 * Unit tests for per-action identity resolution (MV-7).
 * resolveActor is the single entry point — mock PIN in the demo,
 * server-side resolution in production.
 */

import { describe, it, expect } from "vitest";
import {
  resolveActor,
  mockPinFor,
  getActiveRoster,
  ActorRejectionCode,
} from "./identity";
import type { PipelineWorld, ShiftRoster } from "@/lib/domain";
import { NodeKind } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Fixture world
// ---------------------------------------------------------------------------

function makeWorld(overrides?: Partial<PipelineWorld>): PipelineWorld {
  return {
    pipeline: { id: "p1", name: "Test", diameterInches: 16, totalLengthKm: 100, segments: [] },
    stations: [{ id: "STA-1", name: "Sala", kind: NodeKind.PUMP_STATION, km: 0, pipelineId: "p1" }],
    tanks: [],
    shippers: [],
    equipment: [],
    movements: [],
    volumeTargets: [],
    custodyDifferences: [],
    maintenancePlans: [],
    workOrders: [],
    cathodicReadings: [],
    telemetry: [],
    operators: [
      { id: "OPR-0580", name: "María Soto", initials: "MS" },
      { id: "OPR-0581", name: "Juan Pérez", initials: "JP" },
      { id: "OPR-0599", name: "Rosa Fuentes", initials: "RF" },
    ],
    workstations: [{ id: "WST-0585", label: "SALA-OPS-PC1" }],
    shiftRosters: [
      {
        id: "ROS-1",
        workstationId: "WST-0585",
        operatorIds: ["OPR-0580", "OPR-0581"],
        startedAt: "2026-06-12T08:00:00.000Z",
      },
    ],
    shiftLogEntries: [],
    pipelineStoppages: [],
    emissionEntries: [],
    closingComments: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mockPinFor
// ---------------------------------------------------------------------------

describe("mockPinFor", () => {
  it("derives a deterministic 4-digit PIN from the operator id (demo-only)", () => {
    expect(mockPinFor("OPR-0580")).toBe("0580");
    expect(mockPinFor("OPR-0581")).toBe("0581");
    // Deterministic: same input, same PIN
    expect(mockPinFor("OPR-0580")).toBe(mockPinFor("OPR-0580"));
    expect(mockPinFor("OPR-0580")).toMatch(/^\d{4}$/);
  });
});

// ---------------------------------------------------------------------------
// getActiveRoster
// ---------------------------------------------------------------------------

describe("getActiveRoster", () => {
  it("returns the latest roster (by startedAt) for the workstation", () => {
    const newer: ShiftRoster = {
      id: "ROS-2",
      workstationId: "WST-0585",
      operatorIds: ["OPR-0599"],
      startedAt: "2026-06-12T20:00:00.000Z",
    };
    const world = makeWorld();
    world.shiftRosters.push(newer);
    expect(getActiveRoster(world, "WST-0585")?.id).toBe("ROS-2");
  });

  it("returns null when the workstation has no roster", () => {
    const world = makeWorld({ shiftRosters: [] });
    expect(getActiveRoster(world, "WST-0585")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveActor
// ---------------------------------------------------------------------------

describe("resolveActor", () => {
  it("resolves the operator when the PIN is correct and they are on the active roster", () => {
    const result = resolveActor(makeWorld(), "WST-0585", {
      operatorId: "OPR-0580",
      pin: mockPinFor("OPR-0580"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operator.id).toBe("OPR-0580");
      expect(result.operator.name).toBe("María Soto");
    }
  });

  it("rejects a wrong PIN", () => {
    const result = resolveActor(makeWorld(), "WST-0585", {
      operatorId: "OPR-0580",
      pin: "9999",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(ActorRejectionCode.INVALID_PIN);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("rejects an operator who is not on the declared roster (even with a valid PIN)", () => {
    // OPR-0599 exists in the world but is not in ROS-1
    const result = resolveActor(makeWorld(), "WST-0585", {
      operatorId: "OPR-0599",
      pin: mockPinFor("OPR-0599"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ActorRejectionCode.OPERATOR_NOT_IN_ROSTER);
  });

  it("resolves against the LATEST roster: operators of a superseded roster are rejected", () => {
    const world = makeWorld();
    world.shiftRosters.push({
      id: "ROS-2",
      workstationId: "WST-0585",
      operatorIds: ["OPR-0599"],
      startedAt: "2026-06-12T20:00:00.000Z",
    });
    // OPR-0580 was on the older roster only
    const stale = resolveActor(world, "WST-0585", {
      operatorId: "OPR-0580",
      pin: mockPinFor("OPR-0580"),
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe(ActorRejectionCode.OPERATOR_NOT_IN_ROSTER);

    // OPR-0599 is on the new active roster
    const fresh = resolveActor(world, "WST-0585", {
      operatorId: "OPR-0599",
      pin: mockPinFor("OPR-0599"),
    });
    expect(fresh.ok).toBe(true);
  });

  it("rejects an unknown workstation", () => {
    const result = resolveActor(makeWorld(), "WST-9999", {
      operatorId: "OPR-0580",
      pin: mockPinFor("OPR-0580"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ActorRejectionCode.WORKSTATION_NOT_FOUND);
  });

  it("rejects when the workstation has no active roster", () => {
    const world = makeWorld({ shiftRosters: [] });
    const result = resolveActor(world, "WST-0585", {
      operatorId: "OPR-0580",
      pin: mockPinFor("OPR-0580"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ActorRejectionCode.NO_ACTIVE_ROSTER);
  });

  it("rejects a roster operator id that has no operator entity in the world", () => {
    const world = makeWorld();
    world.shiftRosters[0].operatorIds.push("OPR-GHOST");
    const result = resolveActor(world, "WST-0585", {
      operatorId: "OPR-GHOST",
      pin: mockPinFor("OPR-GHOST"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ActorRejectionCode.OPERATOR_NOT_FOUND);
  });
});
