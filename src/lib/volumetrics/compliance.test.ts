import { describe, it, expect } from "vitest";
import { computeCompliance } from "./compliance";

describe("computeCompliance", () => {
  // Scenario 1 — In-band compliance (95–105% range)
  it("returns band=ok when both compliance values are within 95–105%", () => {
    const result = computeCompliance({
      shipperId: "sh1",
      real: 1000,
      programa: 1020,
      presupuesto: 1050,
    });
    // cumplimientoPrograma = 1000/1020*100 ≈ 98.04
    expect(result.cumplimientoPrograma).toBeCloseTo(98.04, 1);
    expect(result.band).toBe("ok");
  });

  // Scenario 2 — Out-of-band compliance (below 90%)
  it("returns band not ok when compliance is well below 95%", () => {
    const result = computeCompliance({
      shipperId: "sh2",
      real: 850,
      programa: 1000,
      presupuesto: 1000,
    });
    expect(result.cumplimientoPrograma).toBeCloseTo(85, 1);
    expect(result.band).not.toBe("ok");
  });

  // Scenario 3 — Waterfall delta sign
  it("returns negative waterfallDelta when real < programa", () => {
    const result = computeCompliance({
      shipperId: "sh3",
      real: 900,
      programa: 1000,
      presupuesto: 1000,
    });
    expect(result.waterfallDelta).toBe(-100);
  });

  // Triangulation: positive waterfall delta when real > programa
  it("returns positive waterfallDelta when real > programa", () => {
    const result = computeCompliance({
      shipperId: "sh4",
      real: 1100,
      programa: 1000,
      presupuesto: 1000,
    });
    expect(result.waterfallDelta).toBe(100);
  });

  // Return shape includes all required fields
  it("returns all required fields in the result shape", () => {
    const result = computeCompliance({
      shipperId: "sh5",
      real: 1000,
      programa: 1000,
      presupuesto: 1000,
    });
    expect(result).toMatchObject({
      shipperId: "sh5",
      real: 1000,
      programa: 1000,
      presupuesto: 1000,
      cumplimientoPrograma: 100,
      cumplimientoPresupuesto: 100,
      band: "ok",
      waterfallDelta: 0,
    });
  });

  // Warning band: compliance 92% (between 90 and 95)
  it("returns band=warning when cumplimientoPrograma is in 90–94.9% range", () => {
    const result = computeCompliance({
      shipperId: "sh6",
      real: 920,
      programa: 1000,
      presupuesto: 1000,
    });
    expect(result.band).toBe("warning");
  });

  // Critical band: compliance below 90%
  it("returns band=critical when cumplimientoPrograma is below 90%", () => {
    const result = computeCompliance({
      shipperId: "sh7",
      real: 800,
      programa: 1000,
      presupuesto: 1000,
    });
    expect(result.band).toBe("critical");
  });

  // Also critical when above 110%
  it("returns band=critical when cumplimientoPrograma exceeds 110%", () => {
    const result = computeCompliance({
      shipperId: "sh8",
      real: 1150,
      programa: 1000,
      presupuesto: 1000,
    });
    expect(result.band).toBe("critical");
  });
});
