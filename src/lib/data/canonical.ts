/**
 * Canonical hero topology for the crude movement diagram (MV-2).
 * Declares the stably-tagged nodes every generated world must contain:
 * OTA inlets, custody tank farms on both regimes, the custody manifold,
 * and the OTC delivery points. Consumed by the generator (to seed them)
 * and by the validator (to assert they exist).
 * Constants only — no runtime logic.
 */

import { NodeKind, VolumeBasis } from "@/lib/domain";

/** Stable tags for the canonical hero stations. */
export const CANONICAL_STATION_TAGS = {
  OLDELVAL_INLET: "OTA-OLDELVAL",
  VMON_INLET: "OTA-VMON",
  ACTIVO_YPF_INLET: "OTA-YPF",
  PUERTO_HERNANDEZ: "OTA-PH",
  TERMINAL_CONCEPCION: "OTC-TC",
  BIO_BIO_REFINERY: "REF-BIOBIO",
  SAN_VICENTE_TERMINAL: "TER-SANVICENTE",
  VESSEL: "VESSEL-BUQUE",
} as const;

/** Declarative spec for one canonical station. */
export interface CanonicalStationSpec {
  tag: string;
  name: string;
  kind: NodeKind;
  /** Km measured from the pipeline start (mutually exclusive with kmFromEnd). */
  kmFromStart?: number;
  /** Km measured back from the pipeline end. */
  kmFromEnd?: number;
}

/**
 * The canonical hero stations. OTA side (Argentina) sits near the pipeline
 * head; OTC side (Chile) near the tail. kmFromEnd values stay within the
 * final 5 km, which the generic station generator never occupies.
 */
export const CANONICAL_STATIONS: readonly CanonicalStationSpec[] = [
  {
    tag: CANONICAL_STATION_TAGS.OLDELVAL_INLET,
    name: "Ingreso OldelVal",
    kind: NodeKind.SOURCE,
    kmFromStart: 0.3,
  },
  {
    tag: CANONICAL_STATION_TAGS.VMON_INLET,
    name: "Ingreso VMON",
    kind: NodeKind.SOURCE,
    kmFromStart: 0.7,
  },
  {
    tag: CANONICAL_STATION_TAGS.ACTIVO_YPF_INLET,
    name: "Ingreso Activo YPF",
    kind: NodeKind.SOURCE,
    kmFromStart: 1.1,
  },
  {
    tag: CANONICAL_STATION_TAGS.PUERTO_HERNANDEZ,
    name: "Puerto Hernández",
    kind: NodeKind.TANK,
    kmFromStart: 2.0,
  },
  {
    tag: CANONICAL_STATION_TAGS.TERMINAL_CONCEPCION,
    name: "Terminal Concepción",
    kind: NodeKind.TANK,
    kmFromEnd: 4.5,
  },
  {
    tag: CANONICAL_STATION_TAGS.BIO_BIO_REFINERY,
    name: "Refinería Bío Bío",
    kind: NodeKind.REFINERY,
    kmFromEnd: 2.5,
  },
  {
    tag: CANONICAL_STATION_TAGS.SAN_VICENTE_TERMINAL,
    name: "Terminal San Vicente",
    kind: NodeKind.TERMINAL,
    kmFromEnd: 1.2,
  },
  {
    tag: CANONICAL_STATION_TAGS.VESSEL,
    name: "Buque Tanque",
    kind: NodeKind.VESSEL,
    kmFromEnd: 0.4,
  },
] as const;

/** Declarative spec for one canonical custody tank. */
export interface CanonicalTankSpec {
  tag: string;
  /** Tag of the canonical station that hosts the tank. */
  stationTag: string;
  volumeBasis: VolumeBasis;
  capacityM3: number;
  /** Initial fill level as a fraction of capacity (kept within [0.2, 0.9]). */
  levelFraction: number;
}

/** Canonical custody tanks: T-101/T-102 on the 15°C regime, T-60x0 on 60°F. */
export const CANONICAL_TANKS: readonly CanonicalTankSpec[] = [
  {
    tag: "T-101",
    stationTag: CANONICAL_STATION_TAGS.PUERTO_HERNANDEZ,
    volumeBasis: VolumeBasis.C15,
    capacityM3: 30000,
    levelFraction: 0.6,
  },
  {
    tag: "T-102",
    stationTag: CANONICAL_STATION_TAGS.PUERTO_HERNANDEZ,
    volumeBasis: VolumeBasis.C15,
    capacityM3: 30000,
    levelFraction: 0.42,
  },
  {
    tag: "T-6010",
    stationTag: CANONICAL_STATION_TAGS.TERMINAL_CONCEPCION,
    volumeBasis: VolumeBasis.F60,
    capacityM3: 50000,
    levelFraction: 0.55,
  },
  {
    tag: "T-6020",
    stationTag: CANONICAL_STATION_TAGS.TERMINAL_CONCEPCION,
    volumeBasis: VolumeBasis.F60,
    capacityM3: 50000,
    levelFraction: 0.45,
  },
  {
    tag: "T-6030",
    stationTag: CANONICAL_STATION_TAGS.TERMINAL_CONCEPCION,
    volumeBasis: VolumeBasis.F60,
    capacityM3: 50000,
    levelFraction: 0.3,
  },
] as const;

/** Tag of the custody manifold valve between the 15°C and 60°F regimes. */
export const CUSTODY_MANIFOLD_TAG = "MOV-CUSTODY";

/** Tag of the deliberately locked-out pump at Terminal Concepción (seeds a LOTO node, MV-5). */
export const CANONICAL_LOCKED_PUMP_TAG = "J-6010";
