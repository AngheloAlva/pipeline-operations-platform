/**
 * Volumetric conversion functions for crude oil.
 * Implements DOMAIN_RULES.md §1 (API/SG conversions and VCF).
 * All functions are pure — no side effects, no external imports beyond constants.
 */

import { THERMAL_EXPANSION_ALPHA } from "@/lib/domain";

// Reference temperatures in °C
const T_REF_15C = 15;
const T_REF_60F_IN_C = (60 - 32) * (5 / 9); // 15.5556°C

/** Convert Fahrenheit to Celsius. */
function fToC(tempF: number): number {
  return ((tempF - 32) * 5) / 9;
}

/**
 * Convert °API gravity to Specific Gravity at 60°F.
 * Formula: SG = 141.5 / (°API + 131.5)
 * §1.1
 */
export function apiToSg(apiGravity: number): number {
  return 141.5 / (apiGravity + 131.5);
}

/**
 * Convert Specific Gravity at 60°F to °API gravity.
 * Formula: °API = (141.5 / SG) - 131.5
 * §1.1
 */
export function sgToApi(sg: number): number {
  return 141.5 / sg - 131.5;
}

/**
 * Volume Correction Factor — corrects observed volume to a reference temperature.
 * Uses linear thermal expansion approximation: V_ref = V_obs / (1 + α × (T_obs − T_ref))
 * §1.3
 *
 * @param vObs - Observed volume in m³
 * @param tObsF - Observed temperature in °F
 * @param tRefC - Reference temperature in °C
 * @returns Corrected volume in m³
 */
export function vcf(vObs: number, tObsF: number, tRefC: number): number {
  const tObsC = fToC(tObsF);
  return vObs / (1 + THERMAL_EXPANSION_ALPHA * (tObsC - tRefC));
}

/**
 * Correct observed volume to 15°C.
 * §1.5
 */
export function toVolume15C(vObs: number, tObsF: number): number {
  return vcf(vObs, tObsF, T_REF_15C);
}

/**
 * Correct observed volume to 60°F (15.56°C reference).
 * §1.5
 */
export function toVolume60F(vObs: number, tObsF: number): number {
  return vcf(vObs, tObsF, T_REF_60F_IN_C);
}

/**
 * Compute Gross Standard Volume (GSV).
 * Per DOMAIN_RULES §1.4: GSV ≈ V@60F (no BSW deduction in this model).
 */
export function toGsv(vObs: number, tObsF: number): number {
  return toVolume60F(vObs, tObsF);
}
