/**
 * Seeded deterministic PRNG and in-lib name pools for the data generator.
 * Implements ADR-2: generateWorld is fully pure — no faker import.
 * PRNG: mulberry32 algorithm seeded via xmur3 hash.
 * All functions are pure (no side effects).
 */

// ============================================================================
// SEEDED PRNG (mulberry32 + xmur3 seed hash)
// ============================================================================

/** A stateful PRNG function that returns values in [0, 1). */
export type Rng = () => number;

/**
 * xmur3 seed hash: converts a string seed to a numeric hash.
 * Used to derive a stable numeric seed from an integer seed value.
 *
 * @param str - Seed string representation
 * @returns A 32-bit integer hash
 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/**
 * mulberry32: a fast, high-quality 32-bit PRNG.
 *
 * @param seed - 32-bit unsigned integer seed
 * @returns A stateful PRNG function returning floats in [0, 1)
 */
function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return function (): number {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a deterministic PRNG seeded by the given integer.
 * Same seed → identical sequence across calls and environments.
 *
 * @param seed - Integer seed value
 * @returns A stateful PRNG function returning floats in [0, 1)
 */
export function createRng(seed: number): Rng {
  const hash = xmur3(String(seed));
  return mulberry32(hash());
}

// ============================================================================
// HELPER PICKERS
// ============================================================================

/**
 * Return a random integer in [min, max] (inclusive).
 *
 * @param rng - PRNG instance
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 */
export function pickInt(rng: Rng, min: number, max: number): number {
  if (min === max) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Return a random float in [min, max].
 *
 * @param rng - PRNG instance
 * @param min - Minimum value
 * @param max - Maximum value
 */
export function pickFloat(rng: Rng, min: number, max: number): number {
  if (min === max) return min;
  return min + rng() * (max - min);
}

/**
 * Return a random element from an array.
 *
 * @param rng - PRNG instance
 * @param arr - Non-empty array to pick from
 */
export function pickOne<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ============================================================================
// NAME POOLS
// ============================================================================

/** Station names for Argentine oil pipeline context. */
export const STATION_NAMES = [
  "Medanito",
  "Cañadón Amarillo",
  "Bajada del Palo",
  "Chihuido",
  "El Porton",
  "Rincón de los Sauces",
  "Aguada Pichana",
  "Loma de la Lata",
  "La Amarga",
  "Vaca Muerta Norte",
  "Señal Picada",
  "Puesto Hernández",
  "Confluencia",
  "Neuquén Terminal",
  "Allen",
  "Cipolletti",
] as const;

/** Shipper / producer company names for Argentine context. */
export const SHIPPER_NAMES = [
  "YPF S.A.",
  "Pan American Energy",
  "Vista Energy",
  "Tecpetrol S.A.",
  "Pampa Energía",
  "CGC S.A.",
  "Pluspetrol S.A.",
  "Shell Argentina",
  "Repsol YPF",
  "Wintershall Dea",
] as const;

/** Crude oil product names. */
export const PRODUCT_NAMES = [
  "OTASA-2",
  "Medanito",
  "Escalante",
  "Cañadón Seco",
  "Hidra",
  "Olmedo",
  "Barda Gonzalez",
  "Rincon",
] as const;

/** Equipment name prefixes by context (tag-prefixes for various equipment types). */
export const EQUIPMENT_NAME_PREFIXES = [
  "Bomba Principal",
  "Bomba de Reserva",
  "Agitador de Tanque",
  "Válvula de Control",
  "Válvula de Bloqueo",
  "Rectificador Catódico",
  "Motor Eléctrico",
  "Transformador",
  "Compresor",
  "Medidor de Flujo",
  "Sensor de Presión",
  "Actuador Neumático",
] as const;
