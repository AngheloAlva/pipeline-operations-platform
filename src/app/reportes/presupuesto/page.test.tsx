/**
 * Tests for /reportes/presupuesto (MV-17) — monthly Ppto vs Real series from
 * a fixture world: coherent numbers, tolerance tones, future months, and the
 * closed-months total.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { PipelineWorld, VolumeTarget } from "@/lib/domain";
import { useWorldStore } from "@/store/worldStore";
import BudgetVsRealReportPage from "./page";

// ---------------------------------------------------------------------------
// Fixture world — only the slices this page consumes
// ---------------------------------------------------------------------------

const volumeTargets: VolumeTarget[] = [
  // TOTAL rows (shipperId undefined)
  { id: "VTG-1", period: "2026-04", budgetM3: 90_000, programM3: 91_000, realM3: 80_000 }, // 88,9 % → critical
  { id: "VTG-2", period: "2026-05", budgetM3: 100_000, programM3: 102_000, realM3: 101_000 }, // 101 % → ok
  { id: "VTG-3", period: "2026-06", budgetM3: 110_000, programM3: 108_000 }, // future, no real
  // Per-shipper row — must NOT appear in the total series
  { id: "VTG-4", period: "2026-05", shipperId: "SHP-A", budgetM3: 40_000, programM3: 41_000, realM3: 40_500 },
];

const fixtureWorld = { volumeTargets } as unknown as PipelineWorld;

beforeEach(() => {
  useWorldStore.setState({ world: fixtureWorld, loaded: true });
});

describe("BudgetVsRealReportPage — MV-17", () => {
  it("renders the report heading", () => {
    render(<BudgetVsRealReportPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /presupuesto vs real/i }),
    ).toBeTruthy();
  });

  it("shows the monthly series with coherent numbers (totals only, ascending)", () => {
    render(<BudgetVsRealReportPage />);

    const table = screen.getByRole("table");
    const periods = within(table)
      .getAllByRole("row")
      .map((row) => row.querySelector("td")?.textContent)
      .filter((text) => text?.startsWith("2026"));
    expect(periods).toEqual(["2026-04", "2026-05", "2026-06"]);

    // 2026-05: real 101 000 → 101,0 % of budget, +1 000 m³ variance
    expect(within(table).getByText("101.000")).toBeTruthy();
    expect(within(table).getByText("101,0%")).toBeTruthy();
    expect(within(table).getByText("1.000")).toBeTruthy();
    // Per-shipper 40 500 m³ row is excluded
    expect(within(table).queryByText("40.500")).toBeNull();
  });

  it("tones each month by its tolerance band and marks future months with —", () => {
    render(<BudgetVsRealReportPage />);

    const table = screen.getByRole("table");
    const may = within(table).getByText("2026-05").closest("tr");
    const april = within(table).getByText("2026-04").closest("tr");
    const june = within(table).getByText("2026-06").closest("tr");

    expect(may?.getAttribute("data-band")).toBe("ok");
    expect(april?.getAttribute("data-band")).toBe("critical");
    // Future month: no band, derived cells show the placeholder
    expect(june?.getAttribute("data-band")).toBe("none");
    expect(within(june as HTMLElement).getAllByText("—").length).toBe(3);
  });

  it("totals only the closed months", () => {
    render(<BudgetVsRealReportPage />);

    const table = screen.getByRole("table");
    const totalRow = within(table).getByText(/total \(2 meses cerrados\)/i).closest("tr");
    expect(totalRow).toBeTruthy();
    // Budget 90 000 + 100 000 (June's 110 000 excluded); real 80 000 + 101 000
    expect(within(totalRow as HTMLElement).getByText("190.000")).toBeTruthy();
    expect(within(totalRow as HTMLElement).getByText("181.000")).toBeTruthy();
    // 181 000 / 190 000 = 95,3 %
    expect(within(totalRow as HTMLElement).getByText("95,3%")).toBeTruthy();
  });
});
