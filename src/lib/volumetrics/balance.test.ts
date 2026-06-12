import { describe, it, expect } from "vitest";
import {
  computeBalance,
  tankHeightToVolume,
  tankVolumeToHeight,
  groupBalanceByHour,
} from "./balance";
import { AlertLevel } from "@/lib/domain";
import type { Movement } from "@/lib/domain";
import seedJson from "@/lib/data/seed.json";

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

  // ---------------------------------------------------------------------------
  // groupBalanceByHour — SR-009
  // New contract (station-to-station movements):
  //   salidas  = bucketed by UTC hour of startedAt (dispatch)
  //   entradas = bucketed by UTC hour of endedAt   (receipt; skip if endedAt is null)
  //   tankIds param removed — call site no longer passes it
  // ---------------------------------------------------------------------------
  describe("groupBalanceByHour", () => {
    function makeMovement(
      partial: Partial<Movement> & { startedAt: string },
    ): Movement {
      return {
        id: partial.id ?? "m1",
        type: "PIPELINE",
        fromNodeId: partial.fromNodeId ?? "STA-0001",
        toNodeId: partial.toNodeId ?? "STA-0002",
        volumeGsvM3: partial.volumeGsvM3 ?? 100,
        volume15CM3: partial.volume15CM3 ?? 100,
        volume60FM3: partial.volume60FM3 ?? 100,
        temperatureF: 77,
        apiGravity: 30,
        ...partial,
      };
    }

    // SR-009 Scenario 1: movements starting in 2 distinct hours → at least 2 salida groups
    it("produces at least 2 hour groups for movements starting in 2 distinct hours", () => {
      const movements: Movement[] = [
        makeMovement({
          id: "a",
          volumeGsvM3: 100,
          startedAt: "2026-06-01T14:00:00Z",
          endedAt: "2026-06-01T14:30:00Z",
        }),
        makeMovement({
          id: "b",
          volumeGsvM3: 200,
          startedAt: "2026-06-01T14:15:00Z",
          endedAt: "2026-06-01T14:45:00Z",
        }),
        makeMovement({
          id: "c",
          volumeGsvM3: 150,
          startedAt: "2026-06-01T14:30:00Z",
          endedAt: "2026-06-01T14:59:00Z",
        }),
        makeMovement({
          id: "d",
          volumeGsvM3: 300,
          startedAt: "2026-06-01T15:00:00Z",
          endedAt: "2026-06-01T15:30:00Z",
        }),
        makeMovement({
          id: "e",
          volumeGsvM3: 250,
          startedAt: "2026-06-01T15:20:00Z",
          endedAt: "2026-06-01T15:50:00Z",
        }),
      ];
      const groups = groupBalanceByHour(movements);
      expect(groups.length).toBeGreaterThanOrEqual(2);
    });

    it("buckets salidas by startedAt hour and entradas by endedAt hour", () => {
      // Movement dispatched at hour 10, received at hour 11 (crosses hour boundary)
      const movements: Movement[] = [
        makeMovement({
          id: "cross-hour",
          volumeGsvM3: 500,
          startedAt: "2026-06-01T10:30:00Z",
          endedAt: "2026-06-01T11:30:00Z",
        }),
      ];
      const groups = groupBalanceByHour(movements);
      // Hour 10: salida = 500, entradas = 0
      const h10 = groups.find((g) => g.hour === 10);
      expect(h10).toBeDefined();
      expect(h10!.salidas).toBeCloseTo(500, 2);
      expect(h10!.entradas).toBeCloseTo(0, 2);
      // Hour 11: entradas = 500, salidas = 0
      const h11 = groups.find((g) => g.hour === 11);
      expect(h11).toBeDefined();
      expect(h11!.entradas).toBeCloseTo(500, 2);
      expect(h11!.salidas).toBeCloseTo(0, 2);
    });

    it("sums salidas and entradas when multiple movements share the same hour", () => {
      const movements: Movement[] = [
        makeMovement({
          id: "x",
          volumeGsvM3: 400,
          startedAt: "2026-06-01T10:00:00Z",
          endedAt: "2026-06-01T10:30:00Z",
        }),
        makeMovement({
          id: "y",
          volumeGsvM3: 200,
          startedAt: "2026-06-01T10:10:00Z",
          endedAt: "2026-06-01T10:40:00Z",
        }),
      ];
      const groups = groupBalanceByHour(movements);
      const h10 = groups.find((g) => g.hour === 10);
      expect(h10).toBeDefined();
      // salidas: both movements start at hour 10
      expect(h10!.salidas).toBeCloseTo(600, 2);
      // entradas: both movements end at hour 10
      expect(h10!.entradas).toBeCloseTo(600, 2);
      // deltaStock = entradas - salidas = 0
      expect(h10!.deltaStock).toBeCloseTo(0, 2);
    });

    it("returns empty array for empty movements", () => {
      const groups = groupBalanceByHour([]);
      expect(groups).toHaveLength(0);
    });

    it("skips entradas for movements with null endedAt", () => {
      const movements: Movement[] = [
        makeMovement({
          id: "in-progress",
          volumeGsvM3: 800,
          startedAt: "2026-06-01T09:00:00Z",
          endedAt: null as unknown as string, // in-progress: no receipt yet
        }),
      ];
      const groups = groupBalanceByHour(movements);
      // salida still counted at dispatch hour
      const h9 = groups.find((g) => g.hour === 9);
      expect(h9).toBeDefined();
      expect(h9!.salidas).toBeCloseTo(800, 2);
      // entradas must be 0 (no receipt)
      const totalEntradas = groups.reduce((sum, g) => sum + g.entradas, 0);
      expect(totalEntradas).toBeCloseTo(0, 2);
    });

    it("deltaStock = entradas - salidas per hour", () => {
      // 3 movements starting at hour 6 (600 m³ each dispatch)
      // 2 of them ending at hour 7 (receipt), 1 still in progress
      const movements: Movement[] = [
        makeMovement({ id: "a", volumeGsvM3: 600, startedAt: "2026-06-01T06:00:00Z", endedAt: "2026-06-01T07:00:00Z" }),
        makeMovement({ id: "b", volumeGsvM3: 600, startedAt: "2026-06-01T06:15:00Z", endedAt: "2026-06-01T07:20:00Z" }),
        makeMovement({ id: "c", volumeGsvM3: 600, startedAt: "2026-06-01T06:30:00Z", endedAt: null as unknown as string }),
      ];
      const groups = groupBalanceByHour(movements);
      const h6 = groups.find((g) => g.hour === 6);
      expect(h6).toBeDefined();
      expect(h6!.salidas).toBeCloseTo(1800, 2);
      expect(h6!.entradas).toBeCloseTo(0, 2);
      expect(h6!.deltaStock).toBeCloseTo(-1800, 2);
      const h7 = groups.find((g) => g.hour === 7);
      expect(h7).toBeDefined();
      expect(h7!.entradas).toBeCloseTo(1200, 2);
      expect(h7!.deltaStock).toBeCloseTo(1200, 2);
    });

    // ---------------------------------------------------------------------------
    // Regression: seed.json movements are STA→STA. The new implementation
    // always produces non-zero bars because salidas = startedAt buckets
    // and entradas = endedAt buckets, independent of node IDs.
    // ---------------------------------------------------------------------------
    it("seed.json STA→STA movements produce non-zero salidas AND non-zero entradas", () => {
      const world = seedJson as import("@/lib/domain").PipelineWorld;
      const groups = groupBalanceByHour(world.movements);

      const totalSalidas = groups.reduce((sum, g) => sum + g.salidas, 0);
      const totalEntradas = groups.reduce((sum, g) => sum + g.entradas, 0);
      // All 90 seed movements have startedAt → salidas must be > 0
      expect(totalSalidas).toBeGreaterThan(0);
      // All 90 seed movements have endedAt → entradas must be > 0
      expect(totalEntradas).toBeGreaterThan(0);
      // Total salidas == total entradas (conservation: every dispatched m³ arrives)
      expect(totalSalidas).toBeCloseTo(totalEntradas, 0);
      expect(groups.length).toBeGreaterThan(0);
    });

    it("sorted ascending by hour", () => {
      const movements: Movement[] = [
        makeMovement({ id: "late", volumeGsvM3: 100, startedAt: "2026-06-01T22:00:00Z", endedAt: "2026-06-01T23:00:00Z" }),
        makeMovement({ id: "early", volumeGsvM3: 100, startedAt: "2026-06-01T05:00:00Z", endedAt: "2026-06-01T06:00:00Z" }),
      ];
      const groups = groupBalanceByHour(movements);
      const hours = groups.map((g) => g.hour);
      for (let i = 1; i < hours.length; i++) {
        expect(hours[i]).toBeGreaterThanOrEqual(hours[i - 1]);
      }
    });
  });
});
