import type { CustodyDifference, MovementType, PipelineWorld, Tank } from "@/lib/domain";
import { toGsv, toVolume15C, toVolume60F } from "@/lib/volumetrics/conversions";

const M3_TO_BARRELS = 6.2898107704321;

export interface VolumeDerivations {
  observedM3: number;
  volume15CM3: number;
  volume60FM3: number;
  gsvM3: number;
  barrels: number;
}

export interface MismatchEstimate {
  beforeM3: number;
  beforePct: number;
  afterM3: number;
  afterPct: number;
}

export interface TankReadingPreview {
  previousStockM3: number;
  deltaM3: number;
  newStockM3: number;
  temperatureF: number;
  volumes: VolumeDerivations;
  mismatch: MismatchEstimate;
}

export interface MovementPreview {
  originStockM3: number | null;
  originNewStockM3: number | null;
  destinationStockM3: number | null;
  destinationNewStockM3: number | null;
  systemStockDeltaM3: number;
  volumes: VolumeDerivations;
  mismatch: MismatchEstimate;
}

export interface MovementPreviewInput {
  type: MovementType;
  fromNodeId: string;
  toNodeId: string;
  volumeM3: number;
  temperatureF?: number;
  apiGravity?: number;
  shipperId?: string;
}

export interface BatchReadingInput {
  fromTankId: string;
  toTankId: string;
  meterStartM3: number;
  meterEndM3: number;
  temperatureF: number;
  apiGravity: number;
  shipperId?: string;
}

/** Parse a decimal field while accepting either comma or dot as decimal separator. */
export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (trimmed === "") return null;

  const comma = trimmed.lastIndexOf(",");
  const dot = trimmed.lastIndexOf(".");
  let normalized = trimmed;

  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    normalized = trimmed.split(groupingSeparator).join("").replace(decimalSeparator, ".");
  } else if (comma >= 0) {
    normalized = trimmed.replace(",", ".");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse an m³ field using the product's displayed locale. A single separator
 * followed by groups of three digits is a thousands separator, so "24.421"
 * means 24 421 m³ instead of 24.421 m³.
 */
export function parseVolumeInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (/^[+-]?\d{1,3}([.,]\d{3})+$/.test(trimmed)) {
    const value = Number(trimmed.replace(/[.,]/g, ""));
    return Number.isFinite(value) ? value : null;
  }
  return parseDecimalInput(trimmed);
}

export function deriveVolumeDerivations(
  observedM3: number,
  temperatureF: number,
): VolumeDerivations {
  const gsvM3 = toGsv(observedM3, temperatureF);
  return {
    observedM3,
    volume15CM3: toVolume15C(observedM3, temperatureF),
    volume60FM3: toVolume60F(observedM3, temperatureF),
    gsvM3,
    barrels: gsvM3 * M3_TO_BARRELS,
  };
}

function latestCustodyPool(records: CustodyDifference[]): CustodyDifference[] {
  if (records.length === 0) return [];
  const latestPeriod = records.reduce(
    (latest, record) => (record.period > latest ? record.period : latest),
    "",
  );
  const latestMonth = latestPeriod.slice(0, 7);
  return records.filter((record) => record.period.slice(0, 7) === latestMonth);
}

export function estimateMismatch(
  records: CustodyDifference[],
  stockDeltaM3: number,
): MismatchEstimate {
  const pool = latestCustodyPool(records);
  const originM3 = pool.reduce((sum, record) => sum + record.originVolM3, 0);
  const destinationM3 = pool.reduce((sum, record) => sum + record.destVolM3, 0);
  const beforeM3 = destinationM3 - originM3;
  const afterM3 = beforeM3 + stockDeltaM3;
  return {
    beforeM3,
    beforePct: originM3 === 0 ? 0 : (beforeM3 / originM3) * 100,
    afterM3,
    afterPct: originM3 === 0 ? 0 : (afterM3 / originM3) * 100,
  };
}

function liveStock(tank: Tank | undefined, liveLevelM3?: number): number | null {
  if (!tank) return null;
  return liveLevelM3 ?? tank.currentLevelM3;
}

export function deriveTankReadingPreview(
  world: PipelineWorld,
  tankId: string,
  levelM3: number,
  temperatureF: number | undefined,
  liveLevelM3?: number,
): TankReadingPreview | null {
  const tank = world.tanks.find((item) => item.id === tankId);
  if (!tank) return null;
  const previousStockM3 = liveStock(tank, liveLevelM3) ?? tank.currentLevelM3;
  const effectiveTemperatureF = temperatureF ?? tank.temperatureF;
  const deltaM3 = levelM3 - previousStockM3;
  return {
    previousStockM3,
    deltaM3,
    newStockM3: levelM3,
    temperatureF: effectiveTemperatureF,
    volumes: deriveVolumeDerivations(levelM3, effectiveTemperatureF),
    mismatch: estimateMismatch(world.custodyDifferences, deltaM3),
  };
}

export function deriveMovementPreview(
  world: PipelineWorld,
  input: MovementPreviewInput,
  originLiveLevelM3?: number,
  destinationLiveLevelM3?: number,
): MovementPreview {
  const origin = world.tanks.find((tank) => tank.id === input.fromNodeId);
  const destination = world.tanks.find((tank) => tank.id === input.toNodeId);
  const originStockM3 = liveStock(origin, originLiveLevelM3);
  const destinationStockM3 = liveStock(destination, destinationLiveLevelM3);
  const systemStockDeltaM3 = (destination ? input.volumeM3 : 0) - (origin ? input.volumeM3 : 0);
  const temperatureF = input.temperatureF ?? origin?.temperatureF ?? 60;

  return {
    originStockM3,
    originNewStockM3: originStockM3 === null ? null : originStockM3 - input.volumeM3,
    destinationStockM3,
    destinationNewStockM3: destinationStockM3 === null ? null : destinationStockM3 + input.volumeM3,
    systemStockDeltaM3,
    volumes: deriveVolumeDerivations(input.volumeM3, temperatureF),
    mismatch: estimateMismatch(world.custodyDifferences, systemStockDeltaM3),
  };
}

export function batchVolumeM3(input: BatchReadingInput): number {
  return input.meterEndM3 - input.meterStartM3;
}
