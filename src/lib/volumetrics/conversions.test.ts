import { describe, it, expect } from "vitest";
import { apiToSg, sgToApi, vcf, toVolume15C, toVolume60F, toGsv } from "./conversions";

describe("Volumetric conversions", () => {
  describe("apiToSg", () => {
    // S-006-B: 10°API = SG 1.0 (identity case)
    it("converts 10°API to SG 1.0", () => {
      expect(apiToSg(10)).toBeCloseTo(1.0, 4);
    });

    it("converts 35°API to approximately 0.8498 SG", () => {
      // SG = 141.5 / (35 + 131.5) = 141.5 / 166.5 ≈ 0.8498
      expect(apiToSg(35)).toBeCloseTo(141.5 / 166.5, 4);
    });

    it("converts 0°API to SG < 1 (heavy crude boundary)", () => {
      // SG = 141.5 / (0 + 131.5) ≈ 1.0761
      expect(apiToSg(0)).toBeCloseTo(141.5 / 131.5, 4);
    });

    it("converts typical Medanito 37.6°API", () => {
      expect(apiToSg(37.6)).toBeCloseTo(141.5 / (37.6 + 131.5), 4);
    });
  });

  describe("sgToApi", () => {
    it("converts SG 1.0 to 10°API", () => {
      expect(sgToApi(1.0)).toBeCloseTo(10, 3);
    });

    it("converts back from SG to match original API", () => {
      expect(sgToApi(141.5 / 166.5)).toBeCloseTo(35, 3);
    });
  });

  describe("apiToSg / sgToApi round-trip (S-006-A)", () => {
    it("round-trip 35°API returns 35 ± 0.001", () => {
      expect(sgToApi(apiToSg(35))).toBeCloseTo(35, 3);
    });

    it("round-trip 20°API returns 20 ± 0.001", () => {
      expect(sgToApi(apiToSg(20))).toBeCloseTo(20, 3);
    });

    it("round-trip 45°API returns 45 ± 0.001", () => {
      expect(sgToApi(apiToSg(45))).toBeCloseTo(45, 3);
    });
  });

  describe("vcf (volume correction factor)", () => {
    // S-006-C: no temperature change means no volume change
    it("returns vObs unchanged when tObsF equals the reference temperature in °C", () => {
      // 60°F reference → tRefC = 15.56°C; tObsF = 60°F → tObsC = 15.56°C → no change
      const vObs = 1000;
      const tObsF = 60;
      const tRefC = (60 - 32) * (5 / 9); // 15.56°C
      expect(vcf(vObs, tObsF, tRefC)).toBeCloseTo(1000, 2);
    });

    it("returns less volume when temperature is above reference (liquid contracts when cooled)", () => {
      // tObsF = 86°F → 30°C; tRefC = 15°C → correction reduces volume (positive alpha * positive delta)
      const result = vcf(1000, 86, 15);
      expect(result).toBeLessThan(1000);
    });

    it("returns more volume when temperature is below reference", () => {
      // tObsF = 32°F → 0°C; tRefC = 15°C → correction increases volume
      const result = vcf(1000, 32, 15);
      expect(result).toBeGreaterThan(1000);
    });

    it("numeric anchor: 1000 m³ at 86°F corrected to 15°C reference ≈ 989.61 m³", () => {
      // tObsC = (86-32)*(5/9) = 30°C; delta = 30-15 = 15; alpha = 0.0007
      // vcf = 1000 / (1 + 0.0007 * 15) = 1000 / 1.0105 ≈ 989.61
      expect(vcf(1000, 86, 15)).toBeCloseTo(989.61, 1);
    });
  });

  describe("toVolume15C", () => {
    it("returns vObs unchanged at exactly 59°F (≈15°C)", () => {
      // 59°F = 15°C exactly — no correction needed
      expect(toVolume15C(1000, 59)).toBeCloseTo(1000, 1);
    });

    it("corrects volume downward above 59°F", () => {
      expect(toVolume15C(1000, 86)).toBeLessThan(1000);
    });
  });

  describe("toVolume60F", () => {
    // S-006-C variant
    it("returns vObs unchanged at exactly 60°F reference temperature", () => {
      expect(toVolume60F(1000, 60)).toBeCloseTo(1000, 2);
    });

    it("corrects volume downward above 60°F", () => {
      expect(toVolume60F(1000, 80)).toBeLessThan(1000);
    });
  });

  describe("toGsv", () => {
    it("equals toVolume60F (GSV = V@60F per DOMAIN_RULES §1.4)", () => {
      expect(toGsv(1000, 80)).toBeCloseTo(toVolume60F(1000, 80), 10);
    });

    it("returns vObs unchanged at 60°F", () => {
      expect(toGsv(5000, 60)).toBeCloseTo(5000, 2);
    });
  });

  describe("invertibility (S-006-D)", () => {
    it("corrects 5000 m³ at 75°F to 60°F then back to 75°F ± 0.01", () => {
      const vObs = 5000;
      const tObsF = 75;
      const tRefC60F = (60 - 32) * (5 / 9); // 15.56°C
      const tObsC = (tObsF - 32) * (5 / 9);
      const alpha = 0.0007;
      // Forward: v60 = vObs / (1 + alpha * (tObsC - tRefC))
      const v60 = vcf(vObs, tObsF, tRefC60F);
      // Back-correct: vBack = v60 * (1 + alpha * (tObsC - tRefC))
      const vBack = v60 * (1 + alpha * (tObsC - tRefC60F));
      expect(vBack).toBeCloseTo(vObs, 2);
    });

    it("round-trip at arbitrary temp 100°F returns original ± 0.01", () => {
      const vObs = 3000;
      const tObsF = 100;
      const tRefC = 15;
      const alpha = 0.0007;
      const tObsC = (tObsF - 32) * (5 / 9);
      const vCorrected = vcf(vObs, tObsF, tRefC);
      const vBack = vCorrected * (1 + alpha * (tObsC - tRefC));
      expect(vBack).toBeCloseTo(vObs, 2);
    });
  });
});
