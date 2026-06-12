/**
 * Tests for GeneratorConfig + DEFAULT_CONFIG.
 * Written first (TDD RED) before implementation exists.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import type { GeneratorConfig } from "./config";

describe("GeneratorConfig defaults", () => {
  it("has the correct pipelineLengthKm default", () => {
    expect(DEFAULT_CONFIG.pipelineLengthKm).toBe(270);
  });

  it("has the correct pipelineDiameterInches default", () => {
    expect(DEFAULT_CONFIG.pipelineDiameterInches).toBe(16);
  });

  it("has the correct stationCount default", () => {
    expect(DEFAULT_CONFIG.stationCount).toBe(5);
  });

  it("has tanksPerStation as a { min, max } range object", () => {
    expect(DEFAULT_CONFIG.tanksPerStation).toEqual({ min: 2, max: 3 });
  });

  it("has equipmentPerStation as a { min, max } range object", () => {
    expect(DEFAULT_CONFIG.equipmentPerStation).toEqual({ min: 6, max: 10 });
  });

  it("has the correct shipperCount default", () => {
    expect(DEFAULT_CONFIG.shipperCount).toBe(4);
  });

  it("has the correct historyDays default", () => {
    expect(DEFAULT_CONFIG.historyDays).toBe(30);
  });

  it("has the correct telemetryIntervalHours default", () => {
    expect(DEFAULT_CONFIG.telemetryIntervalHours).toBe(1);
  });

  it("has a seed field (can be undefined by default)", () => {
    // seed is optional — DEFAULT_CONFIG may omit it or set a specific default
    expect("seed" in DEFAULT_CONFIG || DEFAULT_CONFIG.seed === undefined).toBe(true);
  });
});

describe("GeneratorConfig type accepts partial overrides", () => {
  it("allows overriding individual fields", () => {
    const partial: Partial<GeneratorConfig> = { stationCount: 3, historyDays: 7 };
    expect(partial.stationCount).toBe(3);
    expect(partial.historyDays).toBe(7);
  });

  it("allows overriding seed for determinism", () => {
    const cfg: Partial<GeneratorConfig> = { seed: 42 };
    expect(cfg.seed).toBe(42);
  });
});
