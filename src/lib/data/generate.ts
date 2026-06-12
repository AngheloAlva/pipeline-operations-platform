/**
 * World generator pipeline for the Pipeline Operations Platform.
 * Implements DATA_GENERATOR_SPEC.md §3–§5.
 * Pure TypeScript — no faker, no React, no Next.js.
 * All randomness is injected via a seeded PRNG (ADR-2).
 *
 * Runs 11 FK-ordered steps to produce a fully coherent PipelineWorld.
 */

import type {
  Pipeline,
  PipelineSegment,
  Station,
  Tank,
  Shipper,
  Equipment,
  Movement,
  VolumeTarget,
  MaintenancePlan,
  MaintenanceTask,
  WorkOrder,
  CathodicReading,
  TelemetryPoint,
  PipelineWorld,
} from "@/lib/domain";
import {
  NodeKind,
  EquipmentType,
  MovementType,
  WorkOrderStatus,
  WorkOrderPriority,
  MaintenanceType,
  MaintenanceFrequency,
  TelemetryMetric,
  Criticality,
  AlertLevel,
} from "@/lib/domain";
import { toVolume15C, toVolume60F, toGsv } from "@/lib/volumetrics/conversions";
import { evaluatePotential } from "@/lib/integrity/thresholds";
import { nextDueDateByCalendar } from "@/lib/maintenance/scheduling";
import { DEFAULT_CONFIG } from "./config";
import type { GeneratorConfig } from "./config";
import {
  createRng,
  pickInt,
  pickFloat,
  pickOne,
  STATION_NAMES,
  SHIPPER_NAMES,
  PRODUCT_NAMES,
  EQUIPMENT_NAME_PREFIXES,
} from "./rng";
import type { Rng } from "./rng";

// ============================================================================
// ID GENERATOR
// ============================================================================

let _idCounter = 0;

function resetIdCounter(): void {
  _idCounter = 0;
}

function nextId(prefix: string): string {
  _idCounter++;
  return `${prefix}-${String(_idCounter).padStart(4, "0")}`;
}

// ============================================================================
// STEP 1 — Pipeline + Segments
// ============================================================================

function generatePipeline(cfg: GeneratorConfig, rng: Rng): Pipeline {
  const id = nextId("PL");
  const totalLengthKm = cfg.pipelineLengthKm;

  // Create 3–5 segments covering the full length
  const segCount = pickInt(rng, 3, 5);
  const breakpoints = [0];
  for (let i = 1; i < segCount; i++) {
    const prev = breakpoints[i - 1];
    const remaining = totalLengthKm - prev;
    const segLen = pickFloat(rng, remaining * 0.1, remaining * 0.7);
    breakpoints.push(Math.round((prev + segLen) * 10) / 10);
  }
  breakpoints.push(totalLengthKm);

  const segments: PipelineSegment[] = [];
  for (let i = 0; i < segCount; i++) {
    const fromKm = breakpoints[i];
    const toKm = breakpoints[i + 1];
    const isHighAltitude = i === segCount - 2; // second-to-last is the mountain section
    segments.push({
      id: nextId("SEG"),
      pipelineId: id,
      fromKm,
      toKm,
      label: isHighAltitude ? `Alta montaña pk${fromKm}-pk${toKm}` : undefined,
    });
  }

  return {
    id,
    name: "Oleoducto Principal",
    diameterInches: cfg.pipelineDiameterInches,
    totalLengthKm,
    segments,
  };
}

// ============================================================================
// STEP 2 — Stations
// ============================================================================

function generateStations(pipeline: Pipeline, cfg: GeneratorConfig, rng: Rng): Station[] {
  const count = cfg.stationCount;
  const totalKm = pipeline.totalLengthKm;

  // Assign km marks: first at ~0, last at totalKm, others spread in between
  const kms: number[] = [pickFloat(rng, 0, 10)]; // header near 0
  for (let i = 1; i < count - 1; i++) {
    const prev = kms[i - 1];
    const remaining = totalKm - prev;
    const gap = remaining / (count - i);
    const km = Math.round((prev + gap * pickFloat(rng, 0.7, 1.3)) * 10) / 10;
    kms.push(Math.min(km, totalKm - 5));
  }
  kms.push(totalKm); // TERMINAL at end

  // Shuffle a pool of station names
  const namePool = [...STATION_NAMES];
  const usedNames: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = pickInt(rng, 0, namePool.length - 1);
    usedNames.push(namePool[idx]);
    namePool.splice(idx, 1);
  }

  const kinds = Object.values(NodeKind).filter(
    (k) => k !== NodeKind.VESSEL && k !== NodeKind.SOURCE,
  );

  return kms.map((km, i) => ({
    id: nextId("STA"),
    name: usedNames[i],
    kind: i === 0 ? NodeKind.SOURCE : i === count - 1 ? NodeKind.TERMINAL : pickOne(rng, kinds),
    km,
    pipelineId: pipeline.id,
  }));
}

// ============================================================================
// STEP 3 — Tanks (only for storage-capable stations)
// ============================================================================

function generateTanks(stations: Station[], cfg: GeneratorConfig, rng: Rng): Tank[] {
  // All station kinds can have tanks (pump stations also have surge/slop tanks)
  const storageKinds = new Set<string>(Object.values(NodeKind));
  const tanks: Tank[] = [];

  for (const station of stations) {
    if (!storageKinds.has(station.kind)) continue;
    const count = pickInt(rng, cfg.tanksPerStation.min, cfg.tanksPerStation.max);
    for (let i = 0; i < count; i++) {
      const capacity = pickInt(rng, 15000, 100000);
      const levelFraction = pickFloat(rng, 0.2, 0.9);
      const currentLevelM3 = Math.round(capacity * levelFraction);
      // Gauge factor: capacity / maxHeightMm (assume maxHeight = 20_000 mm for large tanks)
      const maxHeightMm = 20000;
      const gaugeFactor = capacity / maxHeightMm;
      const heightMm = Math.round(currentLevelM3 / gaugeFactor);
      const tagNum = String(tanks.length + 6010).slice(-4);
      tanks.push({
        id: nextId("TNK"),
        tag: `T-${tagNum}`,
        stationId: station.id,
        capacityM3: capacity,
        currentLevelM3,
        heightMm,
        product: pickOne(rng, PRODUCT_NAMES),
        apiGravity: pickFloat(rng, 30, 40),
        temperatureF: pickFloat(rng, 70, 85),
      });
    }
  }

  return tanks;
}

// ============================================================================
// STEP 4 — Equipment
// ============================================================================

const EQUIPMENT_TYPE_BY_KIND: Record<string, EquipmentType[]> = {
  [NodeKind.SOURCE]: [EquipmentType.PUMP, EquipmentType.AGITATOR, EquipmentType.VALVE],
  [NodeKind.PUMP_STATION]: [
    EquipmentType.PUMP,
    EquipmentType.MOTOR,
    EquipmentType.VALVE,
    EquipmentType.RECTIFIER,
  ],
  [NodeKind.TERMINAL]: [
    EquipmentType.PUMP,
    EquipmentType.AGITATOR,
    EquipmentType.VALVE,
    EquipmentType.TRANSFORMER,
  ],
  [NodeKind.REFINERY]: [
    EquipmentType.PUMP,
    EquipmentType.VALVE,
    EquipmentType.MOTOR,
    EquipmentType.TRANSFORMER,
  ],
  [NodeKind.TANK]: [EquipmentType.AGITATOR, EquipmentType.VALVE, EquipmentType.RECTIFIER],
};

const TYPE_TAG_PREFIX: Partial<Record<EquipmentType, string>> = {
  [EquipmentType.PUMP]: "J",
  [EquipmentType.AGITATOR]: "AG",
  [EquipmentType.VALVE]: "MOV",
  [EquipmentType.RECTIFIER]: "REC",
  [EquipmentType.MOTOR]: "MOT",
  [EquipmentType.TRANSFORMER]: "TRF",
  [EquipmentType.OTHER]: "EQ",
};

const ALL_CRITICALITIES: Criticality[] = [
  Criticality.LOW,
  Criticality.MEDIUM,
  Criticality.MEDIUM,
  Criticality.HIGH,
  Criticality.HIGH,
  Criticality.CRITICAL,
];

function generateEquipment(stations: Station[], cfg: GeneratorConfig, rng: Rng): Equipment[] {
  const equipment: Equipment[] = [];

  for (const station of stations) {
    const count = pickInt(rng, cfg.equipmentPerStation.min, cfg.equipmentPerStation.max);
    const typePool = EQUIPMENT_TYPE_BY_KIND[station.kind] ?? Object.values(EquipmentType);

    for (let i = 0; i < count; i++) {
      const type = pickOne(rng, typePool);
      const prefix = TYPE_TAG_PREFIX[type] ?? "EQ";
      const tagNum = String(equipment.length + 1000).slice(-3);
      const namePrefix = pickOne(rng, EQUIPMENT_NAME_PREFIXES);
      equipment.push({
        id: nextId("EQP"),
        tag: `${prefix}-${tagNum}`,
        name: `${namePrefix} ${station.name}`,
        type,
        criticality: pickOne(rng, ALL_CRITICALITIES),
        isOperational: rng() > 0.15, // ~85% operational
        stationId: station.id,
        operatingHours: pickInt(rng, 500, 8000),
      });
    }
  }

  return equipment;
}

// ============================================================================
// STEP 5 — Shippers
// ============================================================================

function generateShippers(cfg: GeneratorConfig, rng: Rng): Shipper[] {
  const pool = [...SHIPPER_NAMES];
  const shippers: Shipper[] = [];
  for (let i = 0; i < cfg.shipperCount; i++) {
    const idx = pickInt(rng, 0, pool.length - 1);
    shippers.push({ id: nextId("SHP"), name: pool[idx] });
    pool.splice(idx, 1);
  }
  return shippers;
}

// ============================================================================
// STEP 6 — Movements (FK-ordered; maintains running tank levels)
// ============================================================================

function generateMovements(
  pipeline: Pipeline,
  stations: Station[],
  tanks: Tank[],
  shippers: Shipper[],
  cfg: GeneratorConfig,
  rng: Rng,
): Movement[] {
  const movements: Movement[] = [];

  // Build a mutable running stock map per tank
  const runningLevel = new Map<string, number>();
  for (const tank of tanks) {
    runningLevel.set(tank.id, tank.currentLevelM3);
  }

  const tanksByStation = new Map<string, Tank[]>();
  for (const tank of tanks) {
    const list = tanksByStation.get(tank.stationId) ?? [];
    list.push(tank);
    tanksByStation.set(tank.stationId, list);
  }

  const stationsWithTanks = stations.filter((s) => (tanksByStation.get(s.id) ?? []).length > 0);
  if (stationsWithTanks.length < 2) {
    // Fallback: just use all stations as nodes
    stationsWithTanks.push(...stations);
  }

  const refDate = new Date(GENERATOR_REFERENCE_DATE + "T12:00:00Z");
  const startDate = new Date(refDate);
  startDate.setDate(startDate.getDate() - cfg.historyDays);

  // Generate at least 1 movement per day
  const movementsPerDay = 3; // 3 per day → 90 total for 30 days
  const totalMovements = cfg.historyDays * movementsPerDay;

  for (let m = 0; m < totalMovements; m++) {
    const dayOffset = Math.floor(m / movementsPerDay);
    const hourOffset = pickInt(rng, 0, 20);
    const startedAt = new Date(startDate);
    startedAt.setDate(startedAt.getDate() + dayOffset);
    startedAt.setHours(hourOffset, 0, 0, 0);
    const endedAt = new Date(startedAt);
    endedAt.setHours(endedAt.getHours() + pickInt(rng, 2, 8));

    // Pick from and to stations
    const fromIdx = pickInt(rng, 0, stationsWithTanks.length - 1);
    let toIdx = pickInt(rng, 0, stationsWithTanks.length - 1);
    if (toIdx === fromIdx) toIdx = (fromIdx + 1) % stationsWithTanks.length;

    const fromStation = stationsWithTanks[fromIdx];
    const toStation = stationsWithTanks[toIdx];

    const fromTanks = tanksByStation.get(fromStation.id) ?? [];
    if (fromTanks.length === 0) continue;

    const fromTank = pickOne(rng, fromTanks);
    const availableVolume = runningLevel.get(fromTank.id) ?? 0;

    // Ensure we never exceed available stock (min 100 m³ to be meaningful)
    if (availableVolume < 100) continue;

    const maxFlow = Math.min(availableVolume * 0.3, 1500);
    const flowRate = pickFloat(rng, 300, Math.max(300, maxFlow));
    const hours = pickFloat(rng, 2, 8);
    const vObs = flowRate * hours;
    const temperature = fromTank.temperatureF;
    const api = fromTank.apiGravity;

    const volumeGsvM3 = toGsv(vObs, temperature);
    const volume15CM3 = toVolume15C(vObs, temperature);
    const volume60FM3 = toVolume60F(vObs, temperature);

    // Inject intentional ±0.2–0.3% mismatch on 10% of movements
    const isIntentionalMismatch = rng() < 0.1;
    const mismatchFactor = isIntentionalMismatch ? 1 + pickFloat(rng, -0.003, 0.003) : 1;

    // Update running level
    runningLevel.set(fromTank.id, availableVolume - vObs * mismatchFactor);

    const toTankList = tanksByStation.get(toStation.id) ?? [];
    if (toTankList.length > 0) {
      const toTank = pickOne(rng, toTankList);
      const toLevel = runningLevel.get(toTank.id) ?? 0;
      runningLevel.set(toTank.id, toLevel + vObs);
    }

    movements.push({
      id: nextId("MOV"),
      type: pickOne(rng, [MovementType.PIPELINE, MovementType.TRANSFER, MovementType.RECEPTION]),
      fromNodeId: fromStation.id,
      toNodeId: toStation.id,
      shipperId: rng() > 0.2 ? pickOne(rng, shippers).id : undefined,
      volumeGsvM3: Math.max(0.01, volumeGsvM3),
      volume15CM3: Math.max(0.01, volume15CM3),
      volume60FM3: Math.max(0.01, volume60FM3),
      temperatureF: temperature,
      apiGravity: api,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    });
  }

  return movements;
}

// ============================================================================
// STEP 7 — Volume Targets
// ============================================================================

function generateVolumeTargets(
  movements: Movement[],
  shippers: Shipper[],
  cfg: GeneratorConfig,
  rng: Rng,
): VolumeTarget[] {
  const targets: VolumeTarget[] = [];
  const today = new Date(GENERATOR_REFERENCE_DATE + "T12:00:00Z");

  // Monthly periods for historyDays range
  const monthsBack = Math.ceil(cfg.historyDays / 30);
  for (let m = 0; m < monthsBack; m++) {
    const periodDate = new Date(today);
    periodDate.setMonth(periodDate.getMonth() - m);
    const period = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`;

    // Total target
    const realMovements = movements.filter((mv) => mv.startedAt.startsWith(period));
    const realM3 = realMovements.reduce((sum, mv) => sum + mv.volumeGsvM3, 0);
    const programM3 =
      realM3 > 0 ? realM3 * pickFloat(rng, 0.95, 1.05) : pickFloat(rng, 50000, 150000);
    const budgetM3 = programM3 * pickFloat(rng, 0.9, 1.1);

    targets.push({
      id: nextId("VTG"),
      period,
      budgetM3: Math.round(budgetM3),
      programM3: Math.round(programM3),
      realM3: realM3 > 0 ? Math.round(realM3) : undefined,
    });

    // Per-shipper targets
    for (const shipper of shippers) {
      const shipperReal = realMovements
        .filter((mv) => mv.shipperId === shipper.id)
        .reduce((sum, mv) => sum + mv.volumeGsvM3, 0);
      const shipperProgram =
        shipperReal > 0 ? shipperReal * pickFloat(rng, 0.95, 1.05) : pickFloat(rng, 10000, 40000);
      targets.push({
        id: nextId("VTG"),
        period,
        shipperId: shipper.id,
        budgetM3: Math.round(shipperProgram * pickFloat(rng, 0.9, 1.1)),
        programM3: Math.round(shipperProgram),
        realM3: shipperReal > 0 ? Math.round(shipperReal) : undefined,
      });
    }
  }

  return targets;
}

// ============================================================================
// STEP 8 — Maintenance Plans + Tasks
// ============================================================================

const CALENDAR_FREQUENCIES: MaintenanceFrequency[] = [
  MaintenanceFrequency.MONTHLY,
  MaintenanceFrequency.QUARTERLY,
  MaintenanceFrequency.BIANNUAL,
  MaintenanceFrequency.ANNUAL,
];

/** A fixed reference date used for all time-based calculations in the generator.
 * Using a fixed date ensures determinism regardless of when the generator runs.
 */
const GENERATOR_REFERENCE_DATE = "2026-06-12";

function todayString(): string {
  return GENERATOR_REFERENCE_DATE;
}

function offsetDate(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateMaintenancePlans(
  equipment: Equipment[],
  rng: Rng,
): { plans: MaintenancePlan[]; tasks: MaintenanceTask[] } {
  const plans: MaintenancePlan[] = [];
  const allTasks: MaintenanceTask[] = [];
  const today = todayString();

  // Generate plans for rotating equipment types
  const rotatingTypes = new Set<EquipmentType>([
    EquipmentType.PUMP,
    EquipmentType.AGITATOR,
    EquipmentType.MOTOR,
  ]);

  for (const equip of equipment) {
    if (!rotatingTypes.has(equip.type)) continue;
    if (rng() > 0.8) continue; // 80% of rotating equipment gets a plan

    const planId = nextId("PLN");
    const tasks: MaintenanceTask[] = [];

    // Generate 1–3 tasks per plan
    const taskCount = pickInt(rng, 1, 3);
    for (let t = 0; t < taskCount; t++) {
      const useHours = rng() > 0.6; // 40% are BY_HOURS
      const taskId = nextId("TSK");

      let nextDueDate: string;
      let intervalHours: number | undefined;
      let nextDueAtHours: number | undefined;
      let frequency: MaintenanceFrequency;

      if (useHours) {
        frequency = MaintenanceFrequency.BY_HOURS;
        intervalHours = equip.type === EquipmentType.PUMP ? 2000 : 1500;
        const lastInterventionHours = Math.max(
          0,
          equip.operatingHours - pickInt(rng, 100, intervalHours),
        );
        nextDueAtHours = lastInterventionHours + intervalHours;
        // Derive a rough calendar date based on hours remaining
        const hoursRemaining = nextDueAtHours - equip.operatingHours;
        // Spread to yield ~15% OVERDUE, 25% UPCOMING, 60% OK
        const daysOffset =
          hoursRemaining > 0 ? Math.round(hoursRemaining / 12) : pickInt(rng, -60, -1);
        nextDueDate = offsetDate(today, daysOffset);
      } else {
        frequency = pickOne(rng, CALENDAR_FREQUENCIES);
        // Last executed: 60% OK (due in future), 25% UPCOMING (≤7 days), 15% OVERDUE
        const roll = rng();
        let lastExecutedOffset: number;
        if (roll < 0.15) {
          // OVERDUE: last executed > interval ago
          lastExecutedOffset = -pickInt(rng, 40, 120);
        } else if (roll < 0.4) {
          // UPCOMING: due in 1–7 days → last executed just past interval - 7
          lastExecutedOffset = -pickInt(rng, 35, 42);
        } else {
          // OK: due in >7 days
          lastExecutedOffset = -pickInt(rng, 1, 20);
        }
        const lastExecuted = offsetDate(today, lastExecutedOffset);
        nextDueDate = nextDueDateByCalendar(lastExecuted, frequency);
      }

      const task: MaintenanceTask = {
        id: taskId,
        planId,
        name: `${equip.name} — Mantenimiento ${t + 1}`,
        type: MaintenanceType.PREVENTIVE,
        frequency,
        intervalHours,
        nextDueDate,
        nextDueAtHours,
      };
      tasks.push(task);
      allTasks.push(task);
    }

    const plan: MaintenancePlan = {
      id: planId,
      name: `Plan Preventivo — ${equip.name}`,
      description: `Plan de mantenimiento preventivo para ${equip.tag}`,
      isActive: true,
      equipmentId: equip.id,
      tasks,
    };
    plans.push(plan);
  }

  return { plans, tasks: allTasks };
}

// ============================================================================
// STEP 9 — Work Orders
// ============================================================================

function generateWorkOrders(
  tasks: MaintenanceTask[],
  equipment: Equipment[],
  stations: Station[],
  rng: Rng,
): WorkOrder[] {
  const workOrders: WorkOrder[] = [];
  const today = todayString();
  const stationIds = stations.map((s) => s.id);
  const equipById = new Map(equipment.map((e) => [e.id, e]));

  // OT counter per station abbreviation
  const otCounters = new Map<string, number>();

  function makeOtNumber(stationId: string): string {
    const station = stations.find((s) => s.id === stationId);
    const abbr = station ? station.name.slice(0, 3).toUpperCase().replace(/\s/g, "") : "GEN";
    const count = (otCounters.get(abbr) ?? 0) + 1;
    otCounters.set(abbr, count);
    return `OT-${abbr}-${String(count).padStart(4, "0")}`;
  }

  // Create WOs from tasks (preventive) — about 50% of tasks become WOs
  for (const task of tasks) {
    if (rng() > 0.5) continue;
    const equip = [...equipById.values()].find((e) => {
      // Find equipment via plan → task relationship
      return true; // simplified: pick a random equipment from same station
    });
    // Pick an equipment
    const randomEquip = equipment[pickInt(rng, 0, equipment.length - 1)];
    const stationId = randomEquip.stationId;
    const statusRoll = rng();
    let status: string;
    let progress: number;

    if (statusRoll < 0.3) {
      status = WorkOrderStatus.COMPLETED;
      progress = 100;
    } else if (statusRoll < 0.6) {
      status = WorkOrderStatus.IN_PROGRESS;
      progress = pickInt(rng, 10, 90);
    } else if (statusRoll < 0.8) {
      status = WorkOrderStatus.PLANNED;
      progress = 0;
    } else {
      status = WorkOrderStatus.ON_HOLD;
      progress = pickInt(rng, 0, 50);
    }

    workOrders.push({
      id: nextId("WO"),
      otNumber: makeOtNumber(stationId),
      type: MaintenanceType.PREVENTIVE,
      status: status as WorkOrder["status"],
      priority: pickOne(rng, Object.values(WorkOrderPriority)),
      progress,
      description: `Mantenimiento preventivo — ${task.name}`,
      equipmentId: randomEquip.id,
      stationId,
      taskId: task.id,
      programDate: offsetDate(today, pickInt(rng, -30, 30)),
      estimatedHours: pickFloat(rng, 2, 16),
      startedAt:
        status !== WorkOrderStatus.PLANNED ? offsetDate(today, -pickInt(rng, 1, 30)) : undefined,
      endedAt:
        status === WorkOrderStatus.COMPLETED ? offsetDate(today, -pickInt(rng, 1, 20)) : undefined,
    });
  }

  // Add corrective WOs for non-operational equipment
  for (const equip of equipment) {
    if (equip.isOperational) continue;
    const stationId = equip.stationId;
    workOrders.push({
      id: nextId("WO"),
      otNumber: makeOtNumber(stationId),
      type: MaintenanceType.CORRECTIVE,
      status: WorkOrderStatus.IN_PROGRESS,
      priority: WorkOrderPriority.URGENT,
      progress: pickInt(rng, 10, 80),
      description: `Reparación correctiva — ${equip.name}`,
      equipmentId: equip.id,
      stationId,
      programDate: offsetDate(today, -pickInt(rng, 1, 10)),
      estimatedHours: pickFloat(rng, 4, 24),
      startedAt: offsetDate(today, -pickInt(rng, 1, 5)),
    });
  }

  return workOrders;
}

// ============================================================================
// STEP 10 — Cathodic Readings
// ============================================================================

function generateCathodicReadings(
  pipeline: Pipeline,
  stations: Station[],
  rng: Rng,
): CathodicReading[] {
  const readings: CathodicReading[] = [];
  const today = new Date(GENERATOR_REFERENCE_DATE + "T12:00:00Z");

  for (const segment of pipeline.segments) {
    // Generate 3–6 readings per segment
    const count = pickInt(rng, 3, 6);
    const segLen = segment.toKm - segment.fromKm;

    for (let i = 0; i < count; i++) {
      const km = segment.fromKm + (segLen * i) / (count - 1);

      // Potential distribution: ~80% OK, ~15% WARNING, ~5% CRITICAL
      const roll = rng();
      let potentialV: number;
      if (roll < 0.05) {
        // CRITICAL: underprotected (above -0.750)
        potentialV = pickFloat(rng, -0.74, -0.3);
      } else if (roll < 0.2) {
        // WARNING: marginal (-0.850 to -0.750) or overprotected (≤ -1.200)
        if (rng() > 0.5) {
          potentialV = pickFloat(rng, -0.849, -0.751);
        } else {
          potentialV = pickFloat(rng, -1.5, -1.201);
        }
      } else {
        // OK: well protected (-1.200 to -0.850)
        potentialV = pickFloat(rng, -1.199, -0.851);
      }

      const level = evaluatePotential(potentialV);
      const nearestStation = stations.reduce((best, s) =>
        Math.abs(s.km - km) < Math.abs(best.km - km) ? s : best,
      );

      // takenAt: spread over the last 30 days
      const daysAgo = pickInt(rng, 0, 29);
      const takenAt = new Date(today);
      takenAt.setDate(takenAt.getDate() - daysAgo);

      readings.push({
        id: nextId("CAT"),
        segmentId: segment.id,
        stationId: nearestStation.id,
        km: Math.round(km * 10) / 10,
        potentialV: Math.round(potentialV * 1000) / 1000,
        takenAt: takenAt.toISOString(),
        level,
      });
    }
  }

  // Inject at least one monotonically degrading series of 3+ readings for trend detection
  const firstSegment = pipeline.segments[0];
  const baseKm = firstSegment.fromKm + 1;
  const degradingPotentials = [-0.9, -0.87, -0.84]; // strictly increasing
  const baseTime = new Date(today);
  baseTime.setDate(baseTime.getDate() - 3);

  for (let i = 0; i < 3; i++) {
    const potentialV = degradingPotentials[i];
    const takenAt = new Date(baseTime);
    takenAt.setDate(takenAt.getDate() + i);
    readings.push({
      id: nextId("CAT"),
      segmentId: firstSegment.id,
      stationId: stations[0]?.id,
      km: baseKm,
      potentialV,
      takenAt: takenAt.toISOString(),
      level: evaluatePotential(potentialV),
    });
  }

  return readings;
}

// ============================================================================
// STEP 11 — Telemetry
// ============================================================================

function generateTelemetry(
  tanks: Tank[],
  pipeline: Pipeline,
  equipment: Equipment[],
  cfg: GeneratorConfig,
  rng: Rng,
): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const now = new Date(GENERATOR_REFERENCE_DATE + "T12:00:00Z");

  // Tank level telemetry — one point per tank per day (subsampled for performance)
  const daysToGenerate = Math.min(cfg.historyDays, 7); // keep JSON size reasonable
  for (const tank of tanks) {
    for (let d = 0; d < daysToGenerate; d++) {
      const ts = new Date(now);
      ts.setDate(ts.getDate() - d);
      ts.setHours(pickInt(rng, 0, 23), 0, 0, 0);
      const noiseLevel = tank.currentLevelM3 * pickFloat(rng, 0.98, 1.02);
      points.push({
        id: nextId("TEL"),
        metric: TelemetryMetric.LEVEL,
        sourceId: tank.id,
        value: Math.round(noiseLevel),
        unit: "mm",
        timestamp: ts.toISOString(),
      });
    }
  }

  // Pressure telemetry per segment
  for (const segment of pipeline.segments) {
    const daysP = Math.min(cfg.historyDays, 3);
    for (let d = 0; d < daysP; d++) {
      const ts = new Date(now);
      ts.setDate(ts.getDate() - d);
      points.push({
        id: nextId("TEL"),
        metric: TelemetryMetric.PRESSURE,
        sourceId: segment.id,
        value: Math.round(pickFloat(rng, 20, 40) * 10) / 10,
        unit: "kg/cm²",
        timestamp: ts.toISOString(),
      });
    }
  }

  // Flow rate telemetry per pump equipment
  const pumps = equipment.filter((e) => e.type === EquipmentType.PUMP);
  for (const pump of pumps.slice(0, 10)) {
    // Limit to avoid huge JSON
    const ts = new Date(now);
    points.push({
      id: nextId("TEL"),
      metric: TelemetryMetric.FLOW_RATE,
      sourceId: pump.id,
      value: Math.round(pickFloat(rng, 300, 1500)),
      unit: "m³/h",
      timestamp: ts.toISOString(),
    });
  }

  return points;
}

// ============================================================================
// MAIN: generateWorld
// ============================================================================

/**
 * Generate a complete PipelineWorld deterministically.
 * Given the same seed, returns structurally identical output.
 *
 * @param config - Optional partial config; merged with DEFAULT_CONFIG. seed controls PRNG.
 * @returns A fully coherent PipelineWorld satisfying all DATA_GENERATOR_SPEC.md §4 rules.
 */
export function generateWorld(config?: Partial<GeneratorConfig>): PipelineWorld {
  resetIdCounter();

  const cfg: GeneratorConfig = { ...DEFAULT_CONFIG, ...config };
  const seed = cfg.seed ?? 0;
  const rng = createRng(seed);

  // Run 11 FK-ordered steps
  const pipeline = generatePipeline(cfg, rng);
  const stations = generateStations(pipeline, cfg, rng);
  const tanks = generateTanks(stations, cfg, rng);
  const equipment = generateEquipment(stations, cfg, rng);
  const shippers = generateShippers(cfg, rng);
  const movements = generateMovements(pipeline, stations, tanks, shippers, cfg, rng);
  const volumeTargets = generateVolumeTargets(movements, shippers, cfg, rng);
  const { plans: maintenancePlans, tasks } = generateMaintenancePlans(equipment, rng);
  const workOrders = generateWorkOrders(tasks, equipment, stations, rng);
  const cathodicReadings = generateCathodicReadings(pipeline, stations, rng);
  const telemetry = generateTelemetry(tanks, pipeline, equipment, cfg, rng);

  return {
    pipeline,
    stations,
    tanks,
    shippers,
    equipment,
    movements,
    volumeTargets,
    maintenancePlans,
    workOrders,
    cathodicReadings,
    telemetry,
  };
}
