import { describe, it, expect } from "vitest";
import { evaluatePotential, detectDegradationTrend } from "./thresholds";
import { AlertLevel } from "@/lib/domain";
import type { CathodicReading } from "@/lib/domain";

function makeReading(potentialV: number, takenAt: string, id = "r1"): CathodicReading {
  return {
    id,
    segmentId: "seg-1",
    km: 100,
    potentialV,
    takenAt,
    level: evaluatePotential(potentialV),
  };
}

describe("Cathodic protection thresholds", () => {
  describe("evaluatePotential", () => {
    // S-009-A: OK classification
    it("returns OK for potential at exactly -0.850 V (threshold boundary)", () => {
      expect(evaluatePotential(-0.85)).toBe(AlertLevel.OK);
    });

    it("returns OK for potential -0.900 V (well protected)", () => {
      expect(evaluatePotential(-0.9)).toBe(AlertLevel.OK);
    });

    it("returns OK for potential -1.100 V (deep protection, not over-protected)", () => {
      expect(evaluatePotential(-1.1)).toBe(AlertLevel.OK);
    });

    // S-009-B: WARNING classification (marginal)
    it("returns WARNING for potential -0.800 V (marginal protection)", () => {
      expect(evaluatePotential(-0.8)).toBe(AlertLevel.WARNING);
    });

    it("returns WARNING for potential just above -0.850 V (e.g. -0.849)", () => {
      expect(evaluatePotential(-0.849)).toBe(AlertLevel.WARNING);
    });

    it("returns WARNING for potential at exactly -0.750 V (WARN boundary)", () => {
      expect(evaluatePotential(-0.75)).toBe(AlertLevel.WARNING);
    });

    // S-009-C: CRITICAL classification (underprotected)
    it("returns CRITICAL for potential -0.700 V (underprotected)", () => {
      expect(evaluatePotential(-0.7)).toBe(AlertLevel.CRITICAL);
    });

    it("returns CRITICAL for potential just above -0.750 V", () => {
      expect(evaluatePotential(-0.749)).toBe(AlertLevel.CRITICAL);
    });

    it("returns CRITICAL for 0 V (no protection)", () => {
      expect(evaluatePotential(0)).toBe(AlertLevel.CRITICAL);
    });

    // S-009-D: Overprotection returns WARNING
    it("returns WARNING for potential -1.300 V (overprotection)", () => {
      expect(evaluatePotential(-1.3)).toBe(AlertLevel.WARNING);
    });

    it("returns WARNING for potential exactly at -1.200 V overprotect threshold", () => {
      expect(evaluatePotential(-1.2)).toBe(AlertLevel.WARNING);
    });

    it("returns OK for potential just above -1.200 V (e.g. -1.199)", () => {
      expect(evaluatePotential(-1.199)).toBe(AlertLevel.OK);
    });
  });

  describe("detectDegradationTrend", () => {
    // S-009-E: three worsening readings (monotonically increasing = less negative)
    it("returns true for three monotonically increasing readings", () => {
      const readings: CathodicReading[] = [
        makeReading(-0.9, "2026-01-01T00:00:00Z", "r1"),
        makeReading(-0.87, "2026-01-02T00:00:00Z", "r2"),
        makeReading(-0.84, "2026-01-03T00:00:00Z", "r3"),
      ];
      expect(detectDegradationTrend(readings)).toBe(true);
    });

    // S-009-F: no trend when not monotonic
    it("returns false for non-monotonic readings", () => {
      const readings: CathodicReading[] = [
        makeReading(-0.9, "2026-01-01T00:00:00Z", "r1"),
        makeReading(-0.91, "2026-01-02T00:00:00Z", "r2"),
        makeReading(-0.88, "2026-01-03T00:00:00Z", "r3"),
      ];
      expect(detectDegradationTrend(readings)).toBe(false);
    });

    it("returns false for stable readings (equal values)", () => {
      const readings: CathodicReading[] = [
        makeReading(-0.9, "2026-01-01T00:00:00Z", "r1"),
        makeReading(-0.9, "2026-01-02T00:00:00Z", "r2"),
        makeReading(-0.9, "2026-01-03T00:00:00Z", "r3"),
      ];
      expect(detectDegradationTrend(readings)).toBe(false);
    });

    it("returns false when fewer than 3 readings", () => {
      const readings: CathodicReading[] = [
        makeReading(-0.9, "2026-01-01T00:00:00Z", "r1"),
        makeReading(-0.87, "2026-01-02T00:00:00Z", "r2"),
      ];
      expect(detectDegradationTrend(readings)).toBe(false);
    });

    it("detects trend in last 3 readings even when array is longer", () => {
      const readings: CathodicReading[] = [
        makeReading(-0.95, "2026-01-01T00:00:00Z", "r1"), // older, stable
        makeReading(-0.93, "2026-01-02T00:00:00Z", "r2"), // older
        makeReading(-0.91, "2026-01-03T00:00:00Z", "r3"), // last 3 worsening
        makeReading(-0.88, "2026-01-04T00:00:00Z", "r4"),
        makeReading(-0.85, "2026-01-05T00:00:00Z", "r5"),
      ];
      expect(detectDegradationTrend(readings)).toBe(true);
    });

    it("returns false for empty readings array", () => {
      expect(detectDegradationTrend([])).toBe(false);
    });

    // Single reading — fewer than 3, must return false
    it("returns false for a single reading", () => {
      const readings: CathodicReading[] = [makeReading(-0.9, "2026-01-01T00:00:00Z", "r1")];
      expect(detectDegradationTrend(readings)).toBe(false);
    });

    // Unsorted input — the function must sort internally and still detect the trend
    it("detects degradation even when readings are provided in reverse chronological order", () => {
      // Most recent → oldest order (reversed), but trend is worsening
      const readings: CathodicReading[] = [
        makeReading(-0.84, "2026-01-03T00:00:00Z", "r3"), // worst (most recent)
        makeReading(-0.87, "2026-01-02T00:00:00Z", "r2"),
        makeReading(-0.9, "2026-01-01T00:00:00Z", "r1"),  // best (oldest)
      ];
      // Internally sorted by takenAt asc → [-0.9, -0.87, -0.84] → strictly increasing → true
      expect(detectDegradationTrend(readings)).toBe(true);
    });

    // Counter-case: last 3 of 4 are stable (one pair equal) — not strictly increasing
    it("returns false when last 3 readings have one equal consecutive pair", () => {
      const readings: CathodicReading[] = [
        makeReading(-0.9, "2026-01-01T00:00:00Z", "r1"),
        makeReading(-0.87, "2026-01-02T00:00:00Z", "r2"),
        makeReading(-0.87, "2026-01-03T00:00:00Z", "r3"), // equal to previous — not strictly increasing
        makeReading(-0.84, "2026-01-04T00:00:00Z", "r4"),
      ];
      // last 3: [-0.87, -0.87, -0.84] → not strictly monotonic (first pair equal)
      expect(detectDegradationTrend(readings)).toBe(false);
    });
  });
});
