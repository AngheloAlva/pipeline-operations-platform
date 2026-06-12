/**
 * Domain constants for the Pipeline Operations Platform.
 * All values sourced from DOMAIN_RULES.md §7.
 * Tunable parameters are marked with their section reference.
 */

// ============================================================================
// PHYSICAL CONSTANTS
// ============================================================================

/** Water density at 60°F in kg/m³ (ASTM D1250 standard). §1.2 */
export const WATER_DENSITY_60F = 999.016;

/** Thermal expansion coefficient for crude oil in /°C. §1.3 */
export const THERMAL_EXPANSION_ALPHA = 0.0007;

// ============================================================================
// BALANCE TOLERANCES
// ============================================================================

/** Acceptable tank balance discrepancy in percent — below this is OK. §2.2 */
export const BALANCE_TOLERANCE_OK = 0.5;

/** Balance discrepancy in percent — above this is CRITICAL (between OK and WARN is WARNING). §2.2 */
export const BALANCE_TOLERANCE_WARN = 1.0;

// ============================================================================
// TANK ALARMS
// ============================================================================

/** High-level alarm threshold as a fraction of tank capacity (0.95 = 95%). §3.2 */
export const TANK_HIGH_LEVEL_ALARM = 0.95;

// ============================================================================
// SIMULATION
// ============================================================================

/** Available simulation speed multipliers. §3.4 */
export const SIM_SPEEDS = [1, 10, 60, 600] as const;

// ============================================================================
// MAINTENANCE INTERVALS
// ============================================================================

/** Pump maintenance interval in operating hours. §4.2 */
export const PUMP_MAINT_INTERVAL_H = 2000;

/** Agitator maintenance interval in operating hours. §4.2 */
export const AGITATOR_MAINT_INTERVAL_H = 1500;

// ============================================================================
// MAINTENANCE PRIORITIZATION WEIGHTS
// ============================================================================

/** Weights for maintenance priority score calculation. §4.4 */
export const CRITICALITY_WEIGHTS = {
  overdue: 0.6,
  criticality: 0.4,
} as const;

// ============================================================================
// CATHODIC PROTECTION THRESHOLDS (in Volts — values are negative)
// ============================================================================

/** Well-protected threshold — at or below this is OK. §5.1 */
export const CATHODIC_OK = -0.85;

/** Marginal protection threshold — above this (less negative) is CRITICAL. §5.1 */
export const CATHODIC_WARN = -0.75;

/** Overprotection threshold — at or below this is WARNING for overprotection. §5.2 */
export const CATHODIC_OVERPROTECT = -1.2;

// ============================================================================
// COMPLIANCE BAND
// ============================================================================

/** Volume compliance band in percent (real vs program/budget). §6 */
export const COMPLIANCE_BAND = {
  min: 95,
  max: 105,
} as const;
