/**
 * TDD — RED tests for waterfall chart data shaping helpers.
 * SR-010: TRUE per-shipper cumulative waterfall (real − programa).
 * Write failing tests FIRST, then implement in waterfall.ts.
 */

import { describe, it, expect } from "vitest";
import {
  buildWaterfallData,
  buildWaterfallEntry,
  buildWaterfallFromDeltas,
  formatWaterfallTick,
} from "./waterfall";
import type { WaterfallEntry } from "./waterfall";

describe("buildWaterfallEntry", () => {
  it("creates an entry with a positive delta (ahead of program)", () => {
    // real=1000, programa=1000, presupuesto=1000 → 100%/100% → "ok"
    const entry = buildWaterfallEntry("SHP-001", "Cargador A", 1000, 1000, 1000);
    expect(entry.shipperId).toBe("SHP-001");
    expect(entry.label).toBe("Cargador A");
    expect(entry.waterfallDelta).toBe(0); // real - programa
    expect(entry.base).toBe(0); // first entry, base = 0
    expect(entry.band).toBe("ok"); // 100% both → ok
  });

  it("creates an entry with a negative delta (behind program)", () => {
    const entry = buildWaterfallEntry("SHP-002", "Cargador B", 850, 1000, 1000);
    expect(entry.waterfallDelta).toBe(-150);
    expect(entry.band).toBe("critical"); // 85% — below warning band
  });

  it("creates an entry within warning band", () => {
    const entry = buildWaterfallEntry("SHP-003", "Cargador C", 930, 1000, 1000);
    expect(entry.waterfallDelta).toBe(-70);
    expect(entry.band).toBe("warning"); // 93% — below ok, above critical
  });

  it("uses waterfallDelta from compliance input accurately", () => {
    // real = 900, programa = 1000 → waterfallDelta = -100 (SR-002 Scenario 3)
    const entry = buildWaterfallEntry("SHP-004", "Cargador D", 900, 1000, 1000);
    expect(entry.waterfallDelta).toBe(-100);
  });
});

describe("buildWaterfallData", () => {
  it("builds entries with cumulative bases for Recharts ComposedChart", () => {
    // 3 shippers: +100, -50, +80 (SR-010 Scenario 1)
    const inputs = [
      { shipperId: "SHP-001", name: "Cargador A", real: 1100, programa: 1000, presupuesto: 1050 },
      { shipperId: "SHP-002", name: "Cargador B", real: 950, programa: 1000, presupuesto: 1000 },
      { shipperId: "SHP-003", name: "Cargador C", real: 1080, programa: 1000, presupuesto: 1000 },
    ];
    const result = buildWaterfallData(inputs);

    expect(result).toHaveLength(3);

    // First shipper: base=0, delta=+100
    expect(result[0].base).toBe(0);
    expect(result[0].waterfallDelta).toBe(100);

    // Second shipper: base = 0 + 100 = 100, delta = -50
    expect(result[1].base).toBe(100);
    expect(result[1].waterfallDelta).toBe(-50);

    // Third shipper: base = 100 + (-50) = 50, delta = +80
    expect(result[2].base).toBe(50);
    expect(result[2].waterfallDelta).toBe(80);
  });

  it("returns empty array for empty input", () => {
    expect(buildWaterfallData([])).toEqual([]);
  });

  it("negative deltas shift base downward", () => {
    const inputs = [
      { shipperId: "SHP-001", name: "A", real: 800, programa: 1000, presupuesto: 1000 },
      { shipperId: "SHP-002", name: "B", real: 700, programa: 1000, presupuesto: 1000 },
    ];
    const result = buildWaterfallData(inputs);
    // First: base=0, delta=-200
    expect(result[0].base).toBe(0);
    expect(result[0].waterfallDelta).toBe(-200);
    // Second: base = 0 + (-200) = -200, delta=-300
    expect(result[1].base).toBe(-200);
    expect(result[1].waterfallDelta).toBe(-300);
  });

  it("assigns correct band per shipper SR-010 color rule", () => {
    const inputs = [
      // ok band: 98% both programa and presupuesto → "ok"
      { shipperId: "SHP-001", name: "A", real: 980, programa: 1000, presupuesto: 990 },
      // critical band: 85% programa → "critical"
      { shipperId: "SHP-002", name: "B", real: 850, programa: 1000, presupuesto: 1000 },
    ];
    const result = buildWaterfallData(inputs);
    expect(result[0].band).toBe("ok");
    expect(result[1].band).toBe("critical");
  });
});

describe("buildWaterfallFromDeltas (MV-15)", () => {
  it("builds cumulative bases from pre-computed deltas and bands", () => {
    const result = buildWaterfallFromDeltas([
      { shipperId: "SHP-001", label: "Cargador A", delta: -120, band: "ok" },
      { shipperId: "SHP-002", label: "Cargador B", delta: 40, band: "warning" },
      { shipperId: "SHP-003", label: "Cargador C", delta: -200, band: "critical" },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      shipperId: "SHP-001",
      label: "Cargador A",
      waterfallDelta: -120,
      base: 0,
      band: "ok",
    });
    // base = 0 + (-120)
    expect(result[1].base).toBe(-120);
    expect(result[1].waterfallDelta).toBe(40);
    expect(result[1].band).toBe("warning");
    // base = -120 + 40
    expect(result[2].base).toBe(-80);
    expect(result[2].band).toBe("critical");
  });

  it("returns an empty array for empty input", () => {
    expect(buildWaterfallFromDeltas([])).toEqual([]);
  });
});

describe("formatWaterfallTick (MV-20)", () => {
  it("renders sub-1k magnitudes as plain integers instead of '0k'", () => {
    expect(formatWaterfallTick(0)).toBe("0");
    expect(formatWaterfallTick(250)).toBe("250");
    expect(formatWaterfallTick(-177)).toBe("-177");
    expect(formatWaterfallTick(999)).toBe("999");
  });

  it("never renders '-0k' for small negative values", () => {
    expect(formatWaterfallTick(-300)).not.toBe("-0k");
    expect(formatWaterfallTick(-0)).toBe("0");
  });

  it("rounds fractional sub-1k values to integers", () => {
    expect(formatWaterfallTick(250.6)).toBe("251");
    expect(formatWaterfallTick(-0.4)).toBe("0");
  });

  it("keeps whole thousands in compact 'k' notation", () => {
    expect(formatWaterfallTick(1000)).toBe("1k");
    expect(formatWaterfallTick(-5000)).toBe("-5k");
    expect(formatWaterfallTick(240000)).toBe("240k");
  });

  it("keeps one es-AR decimal for non-whole thousands so adjacent ticks stay distinct", () => {
    expect(formatWaterfallTick(1500)).toBe("1,5k");
    expect(formatWaterfallTick(-1500)).toBe("-1,5k");
  });
});

// Type check — ensure WaterfallEntry has all required fields
const _typeCheck: WaterfallEntry = {
  shipperId: "X",
  label: "X",
  waterfallDelta: 0,
  base: 0,
  band: "ok",
};
void _typeCheck;
