/**
 * Tests for seeded PRNG and name pools.
 * Written first (TDD RED) before implementation exists.
 */
import { describe, it, expect } from "vitest";
import { createRng, pickOne, pickInt, pickFloat, STATION_NAMES, SHIPPER_NAMES, PRODUCT_NAMES, EQUIPMENT_NAME_PREFIXES } from "./rng";

describe("createRng — determinism", () => {
  it("returns the same sequence for the same seed", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const seq1 = [rng1(), rng1(), rng1(), rng1(), rng1()];
    const seq2 = [rng2(), rng2(), rng2(), rng2(), rng2()];
    expect(seq1).toEqual(seq2);
  });

  it("returns different sequences for different seeds", () => {
    const rng1 = createRng(1);
    const rng2 = createRng(2);
    const seq1 = [rng1(), rng1(), rng1()];
    const seq2 = [rng2(), rng2(), rng2()];
    expect(seq1).not.toEqual(seq2);
  });

  it("returns numbers in [0, 1) range", () => {
    const rng = createRng(99);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different calls from same rng advance the sequence", () => {
    const rng = createRng(7);
    const v1 = rng();
    const v2 = rng();
    expect(v1).not.toBe(v2);
  });
});

describe("pickInt", () => {
  it("returns inclusive integers within [min, max]", () => {
    const rng = createRng(10);
    for (let i = 0; i < 100; i++) {
      const v = pickInt(rng, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("returns min when min === max", () => {
    const rng = createRng(0);
    expect(pickInt(rng, 3, 3)).toBe(3);
  });
});

describe("pickFloat", () => {
  it("returns floats within [min, max]", () => {
    const rng = createRng(33);
    for (let i = 0; i < 100; i++) {
      const v = pickFloat(rng, 10.5, 20.5);
      expect(v).toBeGreaterThanOrEqual(10.5);
      expect(v).toBeLessThanOrEqual(20.5);
    }
  });

  it("returns min when min === max", () => {
    const rng = createRng(0);
    expect(pickFloat(rng, 5.5, 5.5)).toBe(5.5);
  });
});

describe("pickOne", () => {
  it("returns a value that exists in the array", () => {
    const rng = createRng(55);
    const arr = ["a", "b", "c", "d"];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pickOne(rng, arr));
    }
  });

  it("is deterministic with the same rng state", () => {
    const rng1 = createRng(77);
    const rng2 = createRng(77);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const picks1 = Array.from({ length: 10 }, () => pickOne(rng1, arr));
    const picks2 = Array.from({ length: 10 }, () => pickOne(rng2, arr));
    expect(picks1).toEqual(picks2);
  });
});

describe("Name pools", () => {
  it("STATION_NAMES is a non-empty array of strings", () => {
    expect(Array.isArray(STATION_NAMES)).toBe(true);
    expect(STATION_NAMES.length).toBeGreaterThan(0);
    expect(typeof STATION_NAMES[0]).toBe("string");
  });

  it("SHIPPER_NAMES is a non-empty array of strings", () => {
    expect(Array.isArray(SHIPPER_NAMES)).toBe(true);
    expect(SHIPPER_NAMES.length).toBeGreaterThan(0);
    expect(typeof SHIPPER_NAMES[0]).toBe("string");
  });

  it("PRODUCT_NAMES is a non-empty array of strings", () => {
    expect(Array.isArray(PRODUCT_NAMES)).toBe(true);
    expect(PRODUCT_NAMES.length).toBeGreaterThan(0);
    expect(typeof PRODUCT_NAMES[0]).toBe("string");
  });

  it("EQUIPMENT_NAME_PREFIXES is a non-empty array of strings", () => {
    expect(Array.isArray(EQUIPMENT_NAME_PREFIXES)).toBe(true);
    expect(EQUIPMENT_NAME_PREFIXES.length).toBeGreaterThan(0);
    expect(typeof EQUIPMENT_NAME_PREFIXES[0]).toBe("string");
  });

  it("STATION_NAMES has at least 10 entries for variety", () => {
    expect(STATION_NAMES.length).toBeGreaterThanOrEqual(10);
  });

  it("SHIPPER_NAMES has at least 6 entries for variety", () => {
    expect(SHIPPER_NAMES.length).toBeGreaterThanOrEqual(6);
  });
});
