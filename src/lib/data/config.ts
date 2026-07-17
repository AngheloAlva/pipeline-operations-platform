/**
 * Generator configuration and defaults for the data generator pipeline.
 * Implements DATA_GENERATOR_SPEC.md §2.
 */

/** A numeric range expressed as inclusive min and max values. */
export interface RangeConfig {
  min: number;
  max: number;
}

/** Configuration for the world generator. All fields are required in the resolved config. */
export interface GeneratorConfig {
  /** Total pipeline length in km. */
  pipelineLengthKm: number;
  /** Pipeline nominal diameter in inches. */
  pipelineDiameterInches: number;
  /** Number of stations along the pipeline. */
  stationCount: number;
  /** Range for number of tanks per station. */
  tanksPerStation: RangeConfig;
  /** Range for number of equipment items per station. */
  equipmentPerStation: RangeConfig;
  /** Number of shippers. */
  shipperCount: number;
  /** Number of history days for movements and telemetry. */
  historyDays: number;
  /** Number of monthly periods emitted for report series (targets, custody, emissions...). */
  reportMonths: number;
  /** Telemetry sampling interval in hours. */
  telemetryIntervalHours: number;
  /** Optional seed for deterministic PRNG. If omitted, a random seed is used. */
  seed?: number;
}

/**
 * Default generator configuration matching DATA_GENERATOR_SPEC.md §2 defaults.
 */
export const DEFAULT_CONFIG: GeneratorConfig = {
  pipelineLengthKm: 270,
  pipelineDiameterInches: 16,
  stationCount: 5,
  tanksPerStation: { min: 2, max: 3 },
  equipmentPerStation: { min: 6, max: 10 },
  shipperCount: 4,
  historyDays: 30,
  reportMonths: 12,
  telemetryIntervalHours: 1,
};
