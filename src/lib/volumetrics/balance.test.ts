import { describe, it, expect } from "vitest";
import { computeBalance, tankHeightToVolume, tankVolumeToHeight } from "./balance";
import { AlertLevel } from "@/lib/domain";

describe("Volumetric balance", () => {
  describe("computeBalance", () => {
    // S-007-A: perfect balance returns OK
    it("returns OK with 0 difference when measured equals calculated", () => {
      const result = computeBalance({
        initial: 10000,
        inputs: [2000],
        outputs: [1500],
        measured: 10500,
      });
      expect(result.difference).toBeCloseTo(0, 5);
      expect(result.percentage).toBeCloseTo(0, 5);
      expect(result.level).toBe(AlertLevel.OK);
    });

    it("calculates correct final stock", () => {
      const result = computeBalance({
        initial: 10000,
        inputs: [2000],
        outputs: [1500],
        measured: 10500,
      });
      expect(result.calculated).toBe(10500);
      expect(result.measured).toBe(10500);
    });

    // S-007-B: small mismatch within 0.5% returns OK
    it("returns OK for 0.3% mismatch (within tolerance)", () => {
      const calculated = 10000;
      // 0.3% above calculated
      const measured = calculated * 1.003;
      const result = computeBalance({
        initial: 10000,
        inputs: [],
        outputs: [],
        measured,
      });
      expect(result.level).toBe(AlertLevel.OK);
      expect(result.percentage).toBeCloseTo(0.3, 2);
    });

    it("returns OK for 0.5% mismatch (exactly at OK threshold)", () => {
      const calculated = 10000;
      const measured = calculated * 1.005;
      const result = computeBalance({
        initial: 10000,
        inputs: [],
        outputs: [],
        measured,
      });
      expect(result.level).toBe(AlertLevel.OK);
    });

    // S-007-C: mismatch between 0.5% and 1.0% returns WARNING
    it("returns WARNING for 0.7% mismatch", () => {
      const calculated = 10000;
      const measured = calculated * 1.007;
      const result = computeBalance({
        initial: 10000,
        inputs: [],
        outputs: [],
        measured,
      });
      expect(result.level).toBe(AlertLevel.WARNING);
      expect(result.percentage).toBeCloseTo(0.7, 2);
    });

    it("returns WARNING for 1.0% mismatch (exactly at WARN threshold)", () => {
      const calculated = 10000;
      const measured = calculated * 1.01;
      const result = computeBalance({
        initial: 10000,
        inputs: [],
        outputs: [],
        measured,
      });
      expect(result.level).toBe(AlertLevel.WARNING);
    });

    // S-007-D: mismatch above 1.0% returns CRITICAL
    it("returns CRITICAL for 1.5% mismatch", () => {
      const calculated = 10000;
      const measured = calculated * 1.015;
      const result = computeBalance({
        initial: 10000,
        inputs: [],
        outputs: [],
        measured,
      });
      expect(result.level).toBe(AlertLevel.CRITICAL);
      expect(result.percentage).toBeCloseTo(1.5, 2);
    });

    it("returns CRITICAL for negative mismatch beyond -1%", () => {
      const calculated = 10000;
      const measured = calculated * 0.985; // -1.5%
      const result = computeBalance({
        initial: 10000,
        inputs: [],
        outputs: [],
        measured,
      });
      expect(result.level).toBe(AlertLevel.CRITICAL);
    });

    it("handles multiple inputs and outputs correctly", () => {
      const result = computeBalance({
        initial: 5000,
        inputs: [1000, 2000],
        outputs: [500, 300],
        measured: 7200,
      });
      // calculated = 5000 + 3000 - 800 = 7200
      expect(result.calculated).toBe(7200);
      expect(result.difference).toBeCloseTo(0, 5);
    });

    it("returns negative difference when measured is less than calculated", () => {
      const result = computeBalance({
        initial: 10000,
        inputs: [],
        outputs: [],
        measured: 9800, // -2% discrepancy
      });
      expect(result.difference).toBeLessThan(0);
      expect(result.level).toBe(AlertLevel.CRITICAL);
    });

    // Zero-denominator guard: calculated=0, measured≠0 → CRITICAL (hidden surplus/deficit)
    it("returns CRITICAL when calculated is 0 but measured is non-zero (zero-stock surplus)", () => {
      const result = computeBalance({
        initial: 0,
        inputs: [],
        outputs: [],
        measured: 500,
      });
      expect(result.calculated).toBe(0);
      expect(result.measured).toBe(500);
      expect(result.level).toBe(AlertLevel.CRITICAL);
    });

    // Zero-denominator guard: calculated=0, measured=0 → OK with percentage 0 (empty tank, no discrepancy)
    it("returns OK with percentage 0 when both calculated and measured are 0 (empty tank)", () => {
      const result = computeBalance({
        initial: 0,
        inputs: [],
        outputs: [],
        measured: 0,
      });
      expect(result.calculated).toBe(0);
      expect(result.measured).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.level).toBe(AlertLevel.OK);
    });
  });

  describe("tankHeightToVolume", () => {
    it("converts height using gauge factor linearly", () => {
      // volume = heightMm * gaugeFactor
      expect(tankHeightToVolume(1000, 10)).toBe(10000);
    });

    it("returns 0 for 0 height", () => {
      expect(tankHeightToVolume(0, 5)).toBe(0);
    });

    it("scales linearly with height", () => {
      const factor = 7.5;
      expect(tankHeightToVolume(2000, factor)).toBe(2000 * factor);
    });
  });

  describe("tankVolumeToHeight", () => {
    it("converts volume to height using gauge factor", () => {
      // height = volume / gaugeFactor
      expect(tankVolumeToHeight(10000, 10)).toBe(1000);
    });

    it("round-trip: volume → height → volume returns original", () => {
      const volume = 25000;
      const gaugeFactor = 8.3;
      const height = tankVolumeToHeight(volume, gaugeFactor);
      expect(tankHeightToVolume(height, gaugeFactor)).toBeCloseTo(volume, 5);
    });

    it("returns 0 for 0 volume", () => {
      expect(tankVolumeToHeight(0, 8)).toBe(0);
    });
  });
});
