import { describe, expect, it } from "vitest";
import { MovementType, NodeKind, VolumeBasis } from "@/lib/domain";
import type { PipelineWorld } from "@/lib/domain";
import {
  batchVolumeM3,
  deriveMovementPreview,
  deriveTankReadingPreview,
  parseDecimalInput,
  parseVolumeInput,
} from "./preview";

function makeWorld(): PipelineWorld {
  return {
    pipeline: { id: "p1", name: "Test", diameterInches: 16, totalLengthKm: 100, segments: [] },
    stations: [
      { id: "STA-1", name: "Origen", kind: NodeKind.SOURCE, km: 0, pipelineId: "p1" },
      { id: "STA-2", name: "Destino", kind: NodeKind.TERMINAL, km: 100, pipelineId: "p1" },
    ],
    tanks: [
      {
        id: "TNK-1",
        tag: "T-101",
        stationId: "STA-1",
        capacityM3: 30000,
        currentLevelM3: 18000,
        heightMm: 9000,
        product: "Medanito",
        apiGravity: 35,
        temperatureF: 59,
        volumeBasis: VolumeBasis.C15,
      },
      {
        id: "TNK-2",
        tag: "T-6010",
        stationId: "STA-2",
        capacityM3: 50000,
        currentLevelM3: 27500,
        heightMm: 11000,
        product: "OTASA-2",
        apiGravity: 34,
        temperatureF: 60,
        volumeBasis: VolumeBasis.F60,
      },
    ],
    shippers: [],
    equipment: [],
    movements: [],
    volumeTargets: [],
    custodyDifferences: [
      {
        id: "CD-1",
        period: "2026-06",
        shipperId: "S-1",
        originVolM3: 100000,
        destVolM3: 99800,
        diffM3: -200,
        diffPct: -0.2,
      },
    ],
    maintenancePlans: [],
    workOrders: [],
    cathodicReadings: [],
    telemetry: [],
    operators: [],
    workstations: [],
    shiftRosters: [],
    shiftLogEntries: [],
    pipelineStoppages: [],
    emissionEntries: [],
    closingComments: [],
  };
}

describe("capture preview parsing", () => {
  it("treats the displayed 24.421 m³ as 24 421 m³, not 24.421 m³", () => {
    expect(parseVolumeInput("24.421")).toBe(24421);
    expect(parseVolumeInput("24,421")).toBe(24421);
  });

  it("keeps decimal parsing for temperatures and ungrouped volumes", () => {
    expect(parseDecimalInput("32,5")).toBe(32.5);
    expect(parseVolumeInput("24421,5")).toBe(24421.5);
  });
});

describe("capture previews", () => {
  it("uses the live level for tank delta, conversions and mismatch estimate", () => {
    const preview = deriveTankReadingPreview(makeWorld(), "TNK-1", 24421, 32, 24421);
    expect(preview?.deltaM3).toBe(0);
    expect(preview?.newStockM3).toBe(24421);
    expect(preview?.volumes.volume15CM3).toBeGreaterThan(24421);
    expect(preview?.volumes.volume60FM3).toBeGreaterThan(24421);
    expect(preview?.mismatch.afterM3).toBe(-200);
  });

  it("derives both tank stocks and conserves system stock for a tank transfer", () => {
    const preview = deriveMovementPreview(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "TNK-1",
      toNodeId: "TNK-2",
      volumeM3: 1000,
      temperatureF: 70,
    });
    expect(preview.originNewStockM3).toBe(17000);
    expect(preview.destinationNewStockM3).toBe(28500);
    expect(preview.systemStockDeltaM3).toBe(0);
    expect(preview.volumes.gsvM3).toBeCloseTo(preview.volumes.volume60FM3, 8);
  });

  it("derives observed batch volume from the two raw meter readings", () => {
    expect(
      batchVolumeM3({
        fromTankId: "TNK-1",
        toTankId: "TNK-2",
        meterStartM3: 120000,
        meterEndM3: 121250,
        temperatureF: 70,
        apiGravity: 35,
      }),
    ).toBe(1250);
  });
});
