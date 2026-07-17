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

/** Volume measurement basis for a custody regime (15°C on the OTA side, 60°F on the OTC side). */
export const VolumeBasis = {
  C15: "15C",
  F60: "60F",
} as const;
export type VolumeBasis = (typeof VolumeBasis)[keyof typeof VolumeBasis];

/** Responsible side for a pipeline stoppage in the monthly report. */
export const StoppageResponsible = {
  OTA: "OTA",
  OTC: "OTC",
  BOTH: "BOTH",
} as const;
export type StoppageResponsible = (typeof StoppageResponsible)[keyof typeof StoppageResponsible];

/** Greenhouse-gas emission scope (GHG Protocol). */
export const EmissionScope = {
  SCOPE_1: "SCOPE_1",
  SCOPE_2: "SCOPE_2",
  SCOPE_3: "SCOPE_3",
} as const;
export type EmissionScope = (typeof EmissionScope)[keyof typeof EmissionScope];

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
  /** Stable tag for canonical hero-topology nodes, e.g. "OTA-PH" (undefined for generic stations). */
  tag?: string;
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
  /** Custody measurement basis: 15°C (OTA side) or 60°F (OTC side). Undefined for generic tanks. */
  volumeBasis?: VolumeBasis;
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
  /** Capture provenance when entered by an operator (undefined for synthetic/SCADA data). */
  captureMeta?: CaptureMeta;
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

/**
 * Custody transfer difference between the origin measurement point
 * (Puerto Hernández / OTA) and the destination (Terminal Concepción / OTC),
 * per shipper and period. Both volumes are GSV at 60°F.
 */
export interface CustodyDifference {
  id: string;
  /** Period identifier, e.g. "2026-05" (monthly) or "2026-05-10" (daily). */
  period: string;
  shipperId: string;
  /** Volume measured at Puerto Hernández (OTA), GSV 60°F, in m³. */
  originVolM3: number;
  /** Volume measured at Terminal Concepción (OTC), GSV 60°F, in m³. */
  destVolM3: number;
  /** Difference: destVolM3 − originVolM3 (negative = transit loss). */
  diffM3: number;
  /** Difference as a percentage of originVolM3. */
  diffPct: number;
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
// IDENTITY AND CAPTURE
// ============================================================================

/** A person on the shift crew (the ~5 operators in the control room, not the 20 users). */
export interface Operator {
  id: string;
  name: string;
  initials: string;
  /* PIN credential is mock/server-side only — never part of the domain model. */
}

/** A physical workstation with a permanent session (never a login), e.g. "SALA-OPS-PC1". */
export interface Workstation {
  id: string;
  label: string;
}

/** Crew declared at the start of a shift (roster + handover). */
export interface ShiftRoster {
  id: string;
  workstationId: string;
  operatorIds: string[];
  /** ISO 8601 shift start time. */
  startedAt: string;
}

/** A structured shift log entry (replaces the free-text daily report). */
export interface ShiftLogEntry {
  id: string;
  /** ISO 8601 timestamp of the event. */
  timestamp: string;
  /** Entry type, e.g. "OPERATION", "HANDOVER", "INCIDENT". */
  type: string;
  description: string;
  stationId?: string;
  authorId: string;
  workstationId: string;
}

/**
 * Amendment envelope (ledger model) attachable to any captured record.
 * Records are never overwritten: a correction creates a new record whose
 * captureMeta points to the superseded one.
 */
export interface CaptureMeta {
  authorId: string;
  /** ISO 8601 timestamp when the value was entered. */
  enteredAt: string;
  workstationId: string;
  /** ID of the record this one corrects (amendment chain). */
  supersedesId?: string;
  /** Previous value, kept for the audit trail. */
  previousValue?: unknown;
}

// ============================================================================
// REPORT-ONLY ENTITIES
// ============================================================================

/** A pipeline stoppage event for the monthly report. */
export interface PipelineStoppage {
  id: string;
  /** Period identifier, e.g. "2026-05". */
  period: string;
  /** ISO 8601 start time of the stoppage. */
  startedAt: string;
  durationHours: number;
  responsible: StoppageResponsible;
  cause: string;
}

/** A greenhouse-gas emission entry by scope for a period. */
export interface EmissionEntry {
  id: string;
  /** Period identifier, e.g. "2026-05". */
  period: string;
  scope: EmissionScope;
  /** Emissions in metric tons of CO₂ equivalent. */
  tonsCo2e: number;
  /** Emission source label, e.g. "Bombas principales". */
  source: string;
}

/** A monthly closing comment per area for the report. */
export interface ClosingComment {
  id: string;
  /** Period identifier, e.g. "2026-05". */
  period: string;
  /** Area name, e.g. "Operaciones", "Mantenimiento". */
  area: string;
  comment: string;
  authorId?: string;
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
  /** Capture provenance when entered by an operator (undefined for synthetic/SCADA data). */
  captureMeta?: CaptureMeta;
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
  custodyDifferences: CustodyDifference[];
  maintenancePlans: MaintenancePlan[];
  workOrders: WorkOrder[];
  cathodicReadings: CathodicReading[];
  telemetry: TelemetryPoint[];
  operators: Operator[];
  workstations: Workstation[];
  shiftRosters: ShiftRoster[];
  shiftLogEntries: ShiftLogEntry[];
  pipelineStoppages: PipelineStoppage[];
  emissionEntries: EmissionEntry[];
  closingComments: ClosingComment[];
}
