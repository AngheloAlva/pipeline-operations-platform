/**
 * Pure KPI selector functions for the overview dashboard.
 * No side effects, no imports beyond domain types.
 * These functions are the single source of truth for overview card values.
 */
import type { PipelineWorld, CathodicReading } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Total stock
// ---------------------------------------------------------------------------

/**
 * Returns the sum of currentLevelM3 across all tanks in the world.
 * Overview KPI: "Stock Total".
 */
export function totalStock(world: PipelineWorld): number {
  return world.tanks.reduce((sum, tank) => sum + tank.currentLevelM3, 0);
}

// ---------------------------------------------------------------------------
// Equipment status counts
// ---------------------------------------------------------------------------

export interface EquipmentStatusCounts {
  operational: number;
  nonOperational: number;
}

/**
 * Returns counts of operational vs non-operational equipment.
 * Overview KPI: "Equipos Operativos / Fuera de Servicio".
 */
export function equipmentStatusCounts(world: PipelineWorld): EquipmentStatusCounts {
  let operational = 0;
  let nonOperational = 0;
  for (const eq of world.equipment) {
    if (eq.isOperational) {
      operational++;
    } else {
      nonOperational++;
    }
  }
  return { operational, nonOperational };
}

// ---------------------------------------------------------------------------
// Latest cathodic reading
// ---------------------------------------------------------------------------

/**
 * Returns the most recent CathodicReading by takenAt, or null if none exist.
 * Overview KPI: "Última Lectura Catódica".
 */
export function latestCathodicReading(world: PipelineWorld): CathodicReading | null {
  if (world.cathodicReadings.length === 0) return null;
  return world.cathodicReadings.reduce((latest, reading) =>
    reading.takenAt > latest.takenAt ? reading : latest,
  );
}
