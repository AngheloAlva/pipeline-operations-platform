/**
 * PIPELINE OPERATIONS PLATFORM — Modelo de datos del núcleo compartido
 * =====================================================================
 *
 * Estos son los tipos del dominio sobre los que se montan los tres módulos
 * (Cockpit, Maintenance/CMMS, Integrity Map). NO contienen lógica: solo
 * definiciones. La lógica vive en lib/ (conversiones, balances, simulación,
 * programación de mantención, umbrales).
 *
 * Convenciones:
 * - Todos los IDs son strings (cuid/uuid en runtime).
 * - Las fechas se modelan como ISO strings o Date según convenga; aquí se usa
 *   `string` (ISO 8601) para que el generador de datos y la serialización sean
 *   triviales. Claude Code puede cambiarlas a Date si se prefiere.
 * - Los volúmenes están en m³ salvo que el nombre indique otra cosa.
 * - "GSV" = Gross Standard Volume (volumen bruto a condiciones estándar).
 *
 * Versión: borrador 1 para revisión. Ajustar nombres/campos antes de codear.
 */

// ============================================================================
// ENUMS Y TIPOS BASE
// ============================================================================

/** Criticidad de un equipo para priorización de mantención. */
export type Criticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Tipo de nodo en el diagrama de flujo del cockpit. */
export type NodeKind =
  | "SOURCE" // origen de crudo (campo/aporte)
  | "TANK" // estanque de almacenamiento
  | "PUMP_STATION" // estación de bombeo
  | "REFINERY" // refinería (destino)
  | "TERMINAL" // terminal marítimo (destino)
  | "VESSEL"; // buque (destino móvil)

/** Tipo de equipo. */
export type EquipmentType =
  | "PUMP" // bomba
  | "AGITATOR" // agitador
  | "VALVE" // válvula
  | "RECTIFIER" // rectificador (protección catódica)
  | "MOTOR"
  | "TRANSFORMER"
  | "OTHER";

/** Tipo de movimiento de crudo entre nodos. */
export type MovementType =
  | "RECEPTION" // recepción desde origen
  | "TRANSFER" // trasvasije entre estanques
  | "PIPELINE" // transporte por oleoducto
  | "VESSEL_LOAD" // carga de buque
  | "VESSEL_UNLOAD" // descarga de buque
  | "REFINERY_DELIVERY"; // entrega a refinería

/** Estado de una orden de trabajo. */
export type WorkOrderStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

/** Prioridad de una orden de trabajo. */
export type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

/** Tipo de mantención. */
export type MaintenanceType = "PREVENTIVE" | "CORRECTIVE" | "PREDICTIVE";

/** Frecuencia de una tarea de mantención preventiva. */
export type MaintenanceFrequency =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "BIANNUAL"
  | "ANNUAL"
  | "BY_HOURS"; // basada en horas de operación acumuladas, no en calendario

/** Tipo de telemetría registrada en una serie temporal. */
export type TelemetryMetric =
  | "PRESSURE" // presión (kg/cm²)
  | "FLOW_RATE" // caudal (m³/h)
  | "LEVEL" // nivel de estanque (mm)
  | "TEMPERATURE" // temperatura (°F)
  | "VOLTAGE"; // voltaje (V)

/** Severidad de una lectura/alerta de integridad. */
export type AlertLevel = "OK" | "WARNING" | "CRITICAL";

// ============================================================================
// GEOGRAFÍA DEL DUCTO (base de los tres módulos)
// ============================================================================

/**
 * El oleoducto completo. Se divide en segmentos por kilómetro (progresiva/pk).
 * Es la columna vertebral: estaciones, equipos y lecturas se ubican sobre él.
 */
export interface Pipeline {
  id: string;
  name: string;
  diameterInches: number; // p.ej. 16 o 30
  totalLengthKm: number; // longitud total en km
  segments: PipelineSegment[];
}

/**
 * Un tramo del ducto entre dos progresivas (pk). Usado en el mapa de integridad
 * para localizar estaciones, rectificadores y lecturas catódicas.
 */
export interface PipelineSegment {
  id: string;
  pipelineId: string;
  fromKm: number; // progresiva inicial (pk)
  toKm: number; // progresiva final (pk)
  label?: string; // p.ej. "Alta montaña pk201-pk270"
}

/**
 * Una estación a lo largo del ducto (cabecera, bombeo intermedio, terminal).
 * Jerárquica: una estación puede contener subestaciones/áreas.
 */
export interface Station {
  id: string;
  name: string; // p.ej. "Puesto Hernández", "Pampa de Tril"
  kind: NodeKind;
  km: number; // progresiva donde se ubica
  parentId?: string; // jerarquía estación → área
  pipelineId: string;
}

// ============================================================================
// ALMACENAMIENTO Y FLUJO (módulo 1: Cockpit)
// ============================================================================

/**
 * Estanque de almacenamiento (T-101, T-6010, etc.). Su nivel cambia con los
 * movimientos; la simulación de caudal lo llena/vacía en el tiempo.
 */
export interface Tank {
  id: string;
  tag: string; // p.ej. "T-6010"
  stationId: string;
  capacityM3: number; // capacidad nominal
  currentLevelM3: number; // volumen actual (estado en runtime)
  heightMm: number; // altura de columna actual (para gauges tipo SCADA)
  product: string; // p.ej. "OTASA-2", "Medanito"
  apiGravity: number; // °API del producto (para conversiones)
  temperatureF: number; // temperatura actual en °F
}

/**
 * Empresa cargadora / aportante de crudo (YPF, Shell, Vista, Equinor...).
 * Usada en los KPIs de participación y cumplimiento del cockpit.
 */
export interface Shipper {
  id: string;
  name: string;
}

/**
 * Un movimiento de crudo entre dos nodos del sistema. Es el evento base del
 * balance volumétrico y de la animación de flujo.
 */
export interface Movement {
  id: string;
  type: MovementType;
  fromNodeId: string; // Station o Tank de origen
  toNodeId: string; // Station, Tank o Vessel de destino
  shipperId?: string; // cargador asociado (si aplica)
  volumeGsvM3: number; // volumen bruto estándar (GSV)
  volume15CM3: number; // volumen a 15°C
  volume60FM3: number; // volumen a 60°F
  temperatureF: number;
  apiGravity: number;
  startedAt: string; // ISO 8601
  endedAt?: string; // ISO 8601 (null si en curso)
}

/**
 * Cifras de programa/presupuesto vs real para un período (mes/día).
 * Alimenta los KPIs de cumplimiento (real vs programa vs presupuesto).
 */
export interface VolumeTarget {
  id: string;
  period: string; // p.ej. "2026-05" o "2026-05-10"
  shipperId?: string; // null = total
  budgetM3: number; // presupuesto
  programM3: number; // programa (última revisión)
  realM3?: number; // real ejecutado (null si futuro)
}

// ============================================================================
// EQUIPOS Y MANTENCIÓN (módulo 2: CMMS)
// ============================================================================

/**
 * Un equipo físico (bomba, agitador, válvula, rectificador...). Jerárquico.
 * Es la entidad que conecta los tres módulos: aparece en el flujo del cockpit,
 * tiene planes de mantención, y se ubica en un pk del mapa de integridad.
 */
export interface Equipment {
  id: string;
  tag: string; // p.ej. "J-6010", "MOV-111"
  name: string;
  type: EquipmentType;
  criticality: Criticality;
  isOperational: boolean;
  stationId: string; // ubicación
  parentId?: string; // jerarquía equipo padre → componentes
  operatingHours: number; // horas de operación acumuladas (para mantención BY_HOURS)
}

/** Plan de mantención asociado a un equipo o estación. */
export interface MaintenancePlan {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  equipmentId?: string;
  stationId?: string;
  tasks: MaintenanceTask[];
}

/** Tarea concreta dentro de un plan, con su frecuencia y próxima ejecución. */
export interface MaintenanceTask {
  id: string;
  planId: string;
  name: string;
  type: MaintenanceType;
  frequency: MaintenanceFrequency;
  intervalHours?: number; // si frequency === "BY_HOURS"
  nextDueDate: string; // ISO 8601 (calculado por lib/maintenance/scheduling)
  nextDueAtHours?: number; // umbral de horas para la próxima (si BY_HOURS)
}

/** Orden de trabajo: ejecución concreta de mantención correctiva o preventiva. */
export interface WorkOrder {
  id: string;
  otNumber: string; // p.ej. "OT-TRA-2103"
  type: MaintenanceType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  progress: number; // 0–100
  description: string;
  equipmentId: string;
  stationId: string;
  taskId?: string; // tarea de plan que la originó (si preventiva)
  programDate: string; // fecha programada (ISO)
  estimatedHours: number;
  startedAt?: string;
  endedAt?: string;
}

// ============================================================================
// INTEGRIDAD Y PROTECCIÓN CATÓDICA (módulo 3: Integrity Map)
// ============================================================================

/**
 * Lectura de protección catódica en un punto del ducto. El módulo de integridad
 * evalúa cada lectura contra umbrales para generar alertas.
 */
export interface CathodicReading {
  id: string;
  segmentId: string; // tramo del ducto
  stationId?: string; // estación/rectificador asociado (si aplica)
  km: number; // progresiva exacta de la medición
  potentialV: number; // potencial medido (V)
  currentA?: number; // corriente (A), si aplica
  takenAt: string; // ISO 8601
  level: AlertLevel; // resultado de evaluar contra umbral (lib/integrity/thresholds)
}

// ============================================================================
// TELEMETRÍA (compartida: alimenta gráficas en los tres módulos)
// ============================================================================

/**
 * Punto de una serie temporal genérica (presión, caudal, nivel, voltaje...).
 * Permite graficar la evolución de cualquier métrica sin un tipo por cada una.
 */
export interface TelemetryPoint {
  id: string;
  metric: TelemetryMetric;
  sourceId: string; // id del Tank/Equipment/Segment medido
  value: number;
  unit: string; // p.ej. "kg/cm²", "m³/h", "mm", "°F", "V"
  timestamp: string; // ISO 8601
}

// ============================================================================
// CONTENEDOR RAÍZ (lo que produce el generador de datos sintéticos)
// ============================================================================

/**
 * El estado completo del mundo sintético. El generador de datos (Fase 0)
 * produce un objeto de este tipo; los módulos lo consumen.
 */
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
