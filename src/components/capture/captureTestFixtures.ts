/**
 * Shared TEST fixtures for the capture component suite (MV-10 / MV-11).
 * Imported only by *.test.tsx files — never by production code.
 *
 * Same fixture world as captureStore.test.ts so component tests exercise the
 * identical write path: two tanks, one workstation, three known operators.
 */

import { useCaptureStore, INITIAL_CAPTURE_SLICE } from "@/store/captureStore";
import { useWorldStore } from "@/store/worldStore";
import { useSimulationStore, INITIAL_SLICE } from "@/store/simulationStore";
import { mockPinFor } from "@/lib/capture/identity";
import {
  Criticality,
  EquipmentType,
  MaintenanceFrequency,
  MaintenanceType,
  NodeKind,
  VolumeBasis,
} from "@/lib/domain";
import type { PipelineWorld } from "@/lib/domain";

export const WORKSTATION_ID = "WST-0585";
export const MARIA = { id: "OPR-0580", name: "María Soto", pin: mockPinFor("OPR-0580") };
export const JUAN = { id: "OPR-0581", name: "Juan Pérez", pin: mockPinFor("OPR-0581") };

export const T_DECLARE = "2026-06-12T20:00:00.000Z";

export function makeCaptureWorld(): PipelineWorld {
  return {
    pipeline: { id: "p1", name: "Test", diameterInches: 16, totalLengthKm: 100, segments: [] },
    stations: [
      { id: "STA-1", name: "Puerto Hernández", kind: NodeKind.SOURCE, km: 0, pipelineId: "p1" },
      { id: "STA-2", name: "Terminal Concepción", kind: NodeKind.TERMINAL, km: 100, pipelineId: "p1" },
    ],
    tanks: [
      {
        id: "TNK-1",
        tag: "T-101",
        stationId: "STA-1",
        capacityM3: 30_000,
        currentLevelM3: 18_000,
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
        capacityM3: 50_000,
        currentLevelM3: 27_500,
        heightMm: 8250,
        product: "OTASA-2",
        apiGravity: 33,
        temperatureF: 60,
        volumeBasis: VolumeBasis.F60,
      },
    ],
    shippers: [{ id: "SHP-1", name: "OldelVal" }],
    // One rotating equipment + a BY_HOURS plan so the pump-run flow (MV-19)
    // is exercised end to end: 1995 h accumulated, due at 2000 h.
    equipment: [
      {
        id: "EQP-1",
        tag: "J-100",
        name: "Bomba de Despacho PH",
        type: EquipmentType.PUMP,
        criticality: Criticality.HIGH,
        isOperational: true,
        stationId: "STA-1",
        operatingHours: 1995,
      },
    ],
    movements: [],
    volumeTargets: [],
    custodyDifferences: [],
    maintenancePlans: [
      {
        id: "PLN-1",
        name: "Plan Bomba de Despacho",
        description: "Usage-based plan for the fixture pump",
        isActive: true,
        equipmentId: "EQP-1",
        tasks: [
          {
            id: "TSK-1",
            planId: "PLN-1",
            name: "Cambio de aceite",
            type: MaintenanceType.PREVENTIVE,
            frequency: MaintenanceFrequency.BY_HOURS,
            intervalHours: 2000,
            nextDueAtHours: 2000,
            nextDueDate: "2027-01-01", // far future — hours drive the status
          },
        ],
      },
    ],
    workOrders: [],
    cathodicReadings: [],
    telemetry: [],
    operators: [
      { id: "OPR-0580", name: "María Soto", initials: "MS" },
      { id: "OPR-0581", name: "Juan Pérez", initials: "JP" },
      { id: "OPR-0599", name: "Rosa Fuentes", initials: "RF" },
    ],
    workstations: [{ id: WORKSTATION_ID, label: "SALA-OPS-PC1" }],
    shiftRosters: [],
    shiftLogEntries: [],
    pipelineStoppages: [],
    emissionEntries: [],
    closingComments: [],
  };
}

/** Reset all three stores to the fixture world (call in beforeEach). */
export function resetCaptureStores(): void {
  useCaptureStore.setState(INITIAL_CAPTURE_SLICE);
  const world = makeCaptureWorld();
  useWorldStore.setState({ world, loaded: true });
  useSimulationStore.setState(INITIAL_SLICE);
  useSimulationStore.getState().init(world);
}

/** Declare the standard test roster (María + Juan) and return María's credential. */
export function declareStandardRoster() {
  const result = useCaptureStore.getState().declareRoster({
    workstationId: WORKSTATION_ID,
    operatorIds: [MARIA.id, JUAN.id],
    startedAt: T_DECLARE,
  });
  if (!result.ok) throw new Error(`fixture roster declaration failed: ${result.message}`);
  return { operatorId: MARIA.id, pin: MARIA.pin };
}
