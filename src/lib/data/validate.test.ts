/**
 * Tests for validateWorld.
 * Written first (TDD RED) before implementation exists.
 * Covers REQ-013 / S-013-A, S-013-B, S-013-C.
 */
import { describe, it, expect } from "vitest";
import { validateWorld } from "./validate";
import { generateWorld } from "./generate";
import type { PipelineWorld } from "@/lib/domain";
import { WorkOrderStatus } from "@/lib/domain";

describe("validateWorld", () => {
  // S-013-A: Valid world passes
  it("S-013-A: generateWorld() output passes validation (valid: true, errors: [])", () => {
    const world = generateWorld({ seed: 42 });
    const result = validateWorld(world);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns ValidationResult with valid and errors fields", () => {
    const world = generateWorld({ seed: 1 });
    const result = validateWorld(world);
    expect(typeof result.valid).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  // S-013-B: FK violation is detected
  it("S-013-B: FK violation on equipment.stationId is detected", () => {
    const world = generateWorld({ seed: 10 });
    const tampered: PipelineWorld = {
      ...world,
      equipment: [
        ...world.equipment.slice(0, -1),
        { ...world.equipment[world.equipment.length - 1], stationId: "nonexistent-station-id" },
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("nonexistent-station-id") || e.toLowerCase().includes("station"))).toBe(true);
  });

  it("FK violation on tank.stationId is detected", () => {
    const world = generateWorld({ seed: 20 });
    const tampered: PipelineWorld = {
      ...world,
      tanks: [
        ...world.tanks.slice(0, -1),
        { ...world.tanks[world.tanks.length - 1], stationId: "bad-station" },
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("FK violation on cathodicReading.segmentId is detected", () => {
    const world = generateWorld({ seed: 30 });
    const tampered: PipelineWorld = {
      ...world,
      cathodicReadings: [
        ...world.cathodicReadings.slice(0, -1),
        { ...world.cathodicReadings[world.cathodicReadings.length - 1], segmentId: "bad-segment" },
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
  });

  // S-013-C: Over-capacity tank is detected
  it("S-013-C: over-capacity tank (currentLevelM3 > capacityM3) is detected", () => {
    const world = generateWorld({ seed: 5 });
    const badTank = world.tanks[0];
    const tampered: PipelineWorld = {
      ...world,
      tanks: [
        { ...badTank, currentLevelM3: badTank.capacityM3 + 1000 },
        ...world.tanks.slice(1),
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(badTank.id))).toBe(true);
  });

  it("negative currentLevelM3 is detected", () => {
    const world = generateWorld({ seed: 6 });
    const tampered: PipelineWorld = {
      ...world,
      tanks: [
        { ...world.tanks[0], currentLevelM3: -1 },
        ...world.tanks.slice(1),
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
  });

  it("stations with non-increasing km are detected", () => {
    const world = generateWorld({ seed: 7 });
    const stations = [...world.stations];
    // Swap first two stations to break km ordering
    if (stations.length >= 2) {
      [stations[0], stations[1]] = [stations[1], stations[0]];
    }
    const tampered: PipelineWorld = { ...world, stations };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("km") || e.toLowerCase().includes("station"))).toBe(true);
  });

  it("cathodic reading level inconsistent with evaluatePotential is detected", async () => {
    const { AlertLevel } = await import("@/lib/domain");
    const world = generateWorld({ seed: 8 });
    const tampered: PipelineWorld = {
      ...world,
      cathodicReadings: [
        {
          ...world.cathodicReadings[0],
          potentialV: -0.900, // OK potential
          level: AlertLevel.CRITICAL, // wrong level
        },
        ...world.cathodicReadings.slice(1),
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("cathodic") || e.toLowerCase().includes("level"))).toBe(true);
  });

  it("WorkOrder with COMPLETED status and progress != 100 is detected", () => {
    const world = generateWorld({ seed: 9 });
    if (world.workOrders.length === 0) return;
    const tampered: PipelineWorld = {
      ...world,
      workOrders: [
        { ...world.workOrders[0], status: WorkOrderStatus.COMPLETED, progress: 50 },
        ...world.workOrders.slice(1),
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("progress") || e.toLowerCase().includes("workorder"))).toBe(true);
  });

  it("WorkOrder with PLANNED status and progress != 0 is detected", () => {
    const world = generateWorld({ seed: 11 });
    if (world.workOrders.length === 0) return;
    const tampered: PipelineWorld = {
      ...world,
      workOrders: [
        { ...world.workOrders[0], status: WorkOrderStatus.PLANNED, progress: 50 },
        ...world.workOrders.slice(1),
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
  });

  it("accumulates multiple errors in the errors array", () => {
    const world = generateWorld({ seed: 15 });
    const tampered: PipelineWorld = {
      ...world,
      tanks: [
        { ...world.tanks[0], currentLevelM3: world.tanks[0].capacityM3 + 500, stationId: "bad-id" },
        ...world.tanks.slice(1),
      ],
    };
    const result = validateWorld(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
