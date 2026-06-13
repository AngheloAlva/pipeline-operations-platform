/**
 * Shared display formatters.
 */

/**
 * Format a pipeline kilometer marker for display as a whole-km PK value.
 * Returns just the rounded number (no "pk"/"PK" prefix) so call sites keep
 * their own decoration. Rounding here is the single source of truth — it
 * avoids both float-precision artifacts (e.g. "6.3100000005765692") and the
 * station-vs-station inconsistency where some views rounded and others showed
 * a decimal. Use ONLY for station PK markers; cathodic-reading km values keep
 * their own (decimal) formatting.
 */
export function formatPk(km: number): string {
  return String(Math.round(km));
}
