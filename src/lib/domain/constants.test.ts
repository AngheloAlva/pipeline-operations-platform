import { describe, it, expect } from "vitest";
import {
  WATER_DENSITY_60F,
  THERMAL_EXPANSION_ALPHA,
  BALANCE_TOLERANCE_OK,
  BALANCE_TOLERANCE_WARN,
  TANK_HIGH_LEVEL_ALARM,
  SIM_SPEEDS,
  PUMP_MAINT_INTERVAL_H,
  AGITATOR_MAINT_INTERVAL_H,
  CRITICALITY_WEIGHTS,
  CATHODIC_OK,
  CATHODIC_WARN,
  CATHODIC_OVERPROTECT,
  COMPLIANCE_BAND,
} from "./constants";

describe("Domain constants", () => {
  describe("Physical constants", () => {
    it("WATER_DENSITY_60F is 999.016 kg/m³", () => {
      expect(WATER_DENSITY_60F).toBe(999.016);
    });

    it("THERMAL_EXPANSION_ALPHA is 0.0007 /°C", () => {
      expect(THERMAL_EXPANSION_ALPHA).toBe(0.0007);
    });
  });

  describe("Balance tolerances", () => {
    it("BALANCE_TOLERANCE_OK is 0.5 percent", () => {
      expect(BALANCE_TOLERANCE_OK).toBe(0.5);
    });

    it("BALANCE_TOLERANCE_WARN is 1.0 percent", () => {
      expect(BALANCE_TOLERANCE_WARN).toBe(1.0);
    });
  });

  describe("Tank alarm", () => {
    it("TANK_HIGH_LEVEL_ALARM is 0.95 fraction", () => {
      expect(TANK_HIGH_LEVEL_ALARM).toBe(0.95);
    });
  });

  describe("Simulation speeds", () => {
    it("SIM_SPEEDS contains [1, 10, 60, 600]", () => {
      expect(SIM_SPEEDS).toEqual([1, 10, 60, 600]);
    });

    it("SIM_SPEEDS has exactly 4 entries", () => {
      expect(SIM_SPEEDS).toHaveLength(4);
    });
  });

  describe("Maintenance intervals", () => {
    it("PUMP_MAINT_INTERVAL_H is 2000 hours", () => {
      expect(PUMP_MAINT_INTERVAL_H).toBe(2000);
    });

    it("AGITATOR_MAINT_INTERVAL_H is 1500 hours", () => {
      expect(AGITATOR_MAINT_INTERVAL_H).toBe(1500);
    });
  });

  describe("Criticality weights", () => {
    it("overdue weight is 0.6", () => {
      expect(CRITICALITY_WEIGHTS.overdue).toBe(0.6);
    });

    it("criticality weight is 0.4", () => {
      expect(CRITICALITY_WEIGHTS.criticality).toBe(0.4);
    });

    it("weights sum to 1.0", () => {
      expect(CRITICALITY_WEIGHTS.overdue + CRITICALITY_WEIGHTS.criticality).toBe(
        1.0
      );
    });
  });

  describe("Cathodic protection thresholds", () => {
    it("CATHODIC_OK is -0.850 V", () => {
      expect(CATHODIC_OK).toBe(-0.85);
    });

    it("CATHODIC_WARN is -0.750 V", () => {
      expect(CATHODIC_WARN).toBe(-0.75);
    });

    it("CATHODIC_OVERPROTECT is -1.200 V", () => {
      expect(CATHODIC_OVERPROTECT).toBe(-1.2);
    });

    it("CATHODIC_OK is more negative than CATHODIC_WARN", () => {
      expect(CATHODIC_OK).toBeLessThan(CATHODIC_WARN);
    });
  });

  describe("Compliance band", () => {
    it("COMPLIANCE_BAND.min is 95 percent", () => {
      expect(COMPLIANCE_BAND.min).toBe(95);
    });

    it("COMPLIANCE_BAND.max is 105 percent", () => {
      expect(COMPLIANCE_BAND.max).toBe(105);
    });
  });
});
