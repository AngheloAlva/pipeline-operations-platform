/**
 * Domain types for the Pipeline Operations Platform.
 * All union/enum-like types use the const-object + typeof pattern (ADR-3).
 * No runtime logic — only type declarations and const objects.
 */

// ============================================================================
// CONST OBJECTS + DERIVED TYPES (enum-like unions)
// ============================================================================

/** Criticality level of equipment for maintenance prioritization. */
export const Criticality = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type Criticality = (typeof Criticality)[keyof typeof Criticality];

/** Node kind in the cockpit flow diagram. */
export const NodeKind = {
  SOURCE: "SOURCE",
  TANK: "TANK",
  PUMP_STATION: "PUMP_STATION",
  REFINERY: "REFINERY",
  TERMINAL: "TERMINAL",
  VESSEL: "VESSEL",
} as const;
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

/** Equipment type. */
export const EquipmentType = {
  PUMP: "PUMP",
  AGITATOR: "AGITATOR",
  VALVE: "VALVE",
  RECTIFIER: "RECTIFIER",
  MOTOR: "MOTOR",
  TRANSFORMER: "TRANSFORMER",
  OTHER: "OTHER",
} as const;
export type EquipmentType = (typeof EquipmentType)[keyof typeof EquipmentType];

/** Crude movement type between nodes. */
export const MovementType = {
  RECEPTION: "RECEPTION",
  TRANSFER: "TRANSFER",
  PIPELINE: "PIPELINE",
  VESSEL_LOAD: "VESSEL_LOAD",
  VESSEL_UNLOAD: "VESSEL_UNLOAD",
  REFINERY_DELIVERY: "REFINERY_DELIVERY",
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];

/** Work order status. */
export const WorkOrderStatus = {
  PLANNED: "PLANNED",
  IN_PROGRESS: "IN_PROGRESS",
  ON_HOLD: "ON_HOLD",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type WorkOrderStatus = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

/** Work order priority. */
export const WorkOrderPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type WorkOrderPriority = (typeof WorkOrderPriority)[keyof typeof WorkOrderPriority];

/** Maintenance type. */
export const MaintenanceType = {
  PREVENTIVE: "PREVENTIVE",
  CORRECTIVE: "CORRECTIVE",
  PREDICTIVE: "PREDICTIVE",
} as const;
export type MaintenanceType = (typeof MaintenanceType)[keyof typeof MaintenanceType];

/** Maintenance task frequency. */
export const MaintenanceFrequency = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  BIANNUAL: "BIANNUAL",
  ANNUAL: "ANNUAL",
  BY_HOURS: "BY_HOURS",
} as const;
export type MaintenanceFrequency = (typeof MaintenanceFrequency)[keyof typeof MaintenanceFrequency];

/** Telemetry metric type. */
export const TelemetryMetric = {
  PRESSURE: "PRESSURE",
  FLOW_RATE: "FLOW_RATE",
  LEVEL: "LEVEL",
  TEMPERATURE: "TEMPERATURE",
  VOLTAGE: "VOLTAGE",
} as const;
export type TelemetryMetric = (typeof TelemetryMetric)[keyof typeof TelemetryMetric];

/** Alert/integrity severity level. */
export const AlertLevel = {
  OK: "OK",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
} as const;
export type AlertLevel = (typeof AlertLevel)[keyof typeof AlertLevel];

// ============================================================================
// PIPELINE GEOGRAPHY
// ============================================================================

/** The complete pipeline. Divided into segments by kilometer (pk). */
export interface Pipeline {
  id: string;
  name: string;
  /** Pipeline diameter in inches, e.g. 16 or 30. */
  diameterInches: number;
  /** Total pipeline length in km. */
  totalLengthKm: number;
  segments: PipelineSegment[];
}

/** A pipeline segment between two kilometer marks (pk). */
export interface PipelineSegment {
  id: string;
  pipelineId: string;
  /** Starting kilometer mark (pk). */
  fromKm: number;
  /** Ending kilometer mark (pk). */
  toKm: number;
  /** Optional label, e.g. "Alta montaña pk201-pk270". */
  label?: string;
}

/** A station along the pipeline (header, intermediate pump, terminal). */
export interface Station {
  id: string;
  name: string;
  kind: NodeKind;
  /** Kilometer mark where the station is located. */
  km: number;
  /** Parent station ID for hierarchical areas. */
  parentId?: string;
  pipelineId: string;
}

// ============================================================================
// STORAGE AND FLOW
// ============================================================================

/** A storage tank. Its level changes with movements. */
export interface Tank {
  id: string;
  /** Tag, e.g. "T-6010". */
  tag: string;
  stationId: string;
  /** Nominal capacity in m³. */
  capacityM3: number;
  /** Current volume in m³. */
  currentLevelM3: number;
  /** Current column height in mm (for SCADA-style gauges). */
  heightMm: number;
  /** Product name, e.g. "OTASA-2", "Medanito". */
  product: string;
  /** Product API gravity in °API. */
  apiGravity: number;
  /** Current temperature in °F. */
  temperatureF: number;
}

/** A crude oil shipper / loader company. */
export interface Shipper {
  id: string;
  name: string;
}

/** A crude oil movement between two nodes. The base event for volumetric balance. */
export interface Movement {
  id: string;
  type: MovementType;
  /** Origin station or tank ID. */
  fromNodeId: string;
  /** Destination station, tank, or vessel ID. */
  toNodeId: string;
  /** Associated shipper, if applicable. */
  shipperId?: string;
  /** Gross Standard Volume in m³. */
  volumeGsvM3: number;
  /** Volume at 15°C in m³. */
  volume15CM3: number;
  /** Volume at 60°F in m³. */
  volume60FM3: number;
  temperatureF: number;
  apiGravity: number;
  /** ISO 8601 start time. */
  startedAt: string;
  /** ISO 8601 end time (null if in progress). */
  endedAt?: string;
}

/** Budget vs actual volume figures for a period. */
export interface VolumeTarget {
  id: string;
  /** Period identifier, e.g. "2026-05" or "2026-05-10". */
  period: string;
  /** Shipper ID (null = total). */
  shipperId?: string;
  /** Budget volume in m³. */
  budgetM3: number;
  /** Program (latest revision) volume in m³. */
  programM3: number;
  /** Actual executed volume in m³ (null if future). */
  realM3?: number;
}

// ============================================================================
// EQUIPMENT AND MAINTENANCE
// ============================================================================

/** A physical equipment item (pump, agitator, valve, rectifier...). */
export interface Equipment {
  id: string;
  /** Tag, e.g. "J-6010", "MOV-111". */
  tag: string;
  name: string;
  type: EquipmentType;
  criticality: Criticality;
  isOperational: boolean;
  stationId: string;
  /** Parent equipment ID for hierarchical components. */
  parentId?: string;
  /** Accumulated operating hours (for BY_HOURS maintenance). */
  operatingHours: number;
}

/** Maintenance plan associated with equipment or a station. */
export interface MaintenancePlan {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  equipmentId?: string;
  stationId?: string;
  tasks: MaintenanceTask[];
}

/** A concrete task within a maintenance plan. */
export interface MaintenanceTask {
  id: string;
  planId: string;
  name: string;
  type: MaintenanceType;
  frequency: MaintenanceFrequency;
  /** Hours interval (required when frequency === "BY_HOURS"). */
  intervalHours?: number;
  /** Next due date in ISO 8601 (computed by lib/maintenance/scheduling). */
  nextDueDate: string;
  /** Next due hours threshold for BY_HOURS tasks. */
  nextDueAtHours?: number;
}

/** Work order: concrete execution of corrective or preventive maintenance. */
export interface WorkOrder {
  id: string;
  /** OT number, e.g. "OT-TRA-2103". */
  otNumber: string;
  type: MaintenanceType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  /** Progress percentage 0–100. */
  progress: number;
  description: string;
  equipmentId: string;
  stationId: string;
  /** Originating plan task (if preventive). */
  taskId?: string;
  /** Scheduled date in ISO 8601. */
  programDate: string;
  estimatedHours: number;
  startedAt?: string;
  endedAt?: string;
}

// ============================================================================
// INTEGRITY AND CATHODIC PROTECTION
// ============================================================================

/** A cathodic protection reading at a point on the pipeline. */
export interface CathodicReading {
  id: string;
  segmentId: string;
  stationId?: string;
  /** Exact kilometer mark of the measurement. */
  km: number;
  /** Measured potential in V (negative). */
  potentialV: number;
  /** Current in A (if applicable). */
  currentA?: number;
  /** Measurement timestamp in ISO 8601. */
  takenAt: string;
  /** Alert level computed by lib/integrity/thresholds. */
  level: AlertLevel;
}

// ============================================================================
// TELEMETRY
// ============================================================================

/** A point in a generic time-series (pressure, flow, level, voltage...). */
export interface TelemetryPoint {
  id: string;
  metric: TelemetryMetric;
  /** ID of the Tank, Equipment, or Segment being measured. */
  sourceId: string;
  value: number;
  /** Unit string, e.g. "kg/cm²", "m³/h", "mm", "°F", "V". */
  unit: string;
  /** Timestamp in ISO 8601. */
  timestamp: string;
}

// ============================================================================
// ROOT CONTAINER
// ============================================================================

/** The complete synthetic world state produced by the data generator. */
export interface PipelineWorld {
  pipeline: Pipeline;
  stations: Station[];
  tanks: Tank[];
  shippers: Shipper[];
  equipment: Equipment[];
  movements: Movement[];
  volumeTargets: VolumeTarget[];
  maintenancePlans: MaintenancePlan[];
  workOrders: WorkOrder[];
  cathodicReadings: CathodicReading[];
  telemetry: TelemetryPoint[];
}
