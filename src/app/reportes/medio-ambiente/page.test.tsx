/**
 * Tests for /reportes/medio-ambiente (MV-18) — GHG emissions from a fixture
 * world: per-month tCO₂e series plus scope and source breakdowns.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { EmissionEntry, PipelineWorld } from "@/lib/domain";
import { EmissionScope } from "@/lib/domain";
import { useWorldStore } from "@/store/worldStore";
import EnvironmentReportPage from "./page";

// ---------------------------------------------------------------------------
// Fixture world — only the slices this page consumes
// ---------------------------------------------------------------------------

const emissionEntries: EmissionEntry[] = [
  { id: "EMI-1", period: "2026-05", scope: EmissionScope.SCOPE_1, tonsCo2e: 1200, source: "Combustión en bombas" },
  { id: "EMI-2", period: "2026-05", scope: EmissionScope.SCOPE_2, tonsCo2e: 400, source: "Energía eléctrica comprada" },
  { id: "EMI-3", period: "2026-05", scope: EmissionScope.SCOPE_3, tonsCo2e: 100, source: "Transporte contratado" },
  // Sparse month: no Scope 3 entry in April
  { id: "EMI-4", period: "2026-04", scope: EmissionScope.SCOPE_1, tonsCo2e: 1000, source: "Combustión en bombas" },
  { id: "EMI-5", period: "2026-04", scope: EmissionScope.SCOPE_2, tonsCo2e: 300, source: "Energía eléctrica comprada" },
];

const fixtureWorld = { emissionEntries } as unknown as PipelineWorld;

beforeEach(() => {
  useWorldStore.setState({ world: fixtureWorld, loaded: true });
});

describe("EnvironmentReportPage — MV-18", () => {
  it("renders the report heading", () => {
    render(<EnvironmentReportPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /medio ambiente/i }),
    ).toBeTruthy();
  });

  it("shows the monthly series with per-scope columns and totals, ascending", () => {
    render(<EnvironmentReportPage />);

    const table = screen.getByRole("table", { name: /emisiones por mes/i });
    const periods = within(table)
      .getAllByRole("row")
      .map((row) => row.querySelector("td")?.textContent)
      .filter((text) => text?.startsWith("2026"));
    expect(periods).toEqual(["2026-04", "2026-05"]);

    const april = within(table).getByText("2026-04").closest("tr");
    const may = within(table).getByText("2026-05").closest("tr");
    // April: 1 000 + 300 = 1 300; missing Scope 3 renders the placeholder
    expect(within(april as HTMLElement).getByText("1.000,0")).toBeTruthy();
    expect(within(april as HTMLElement).getByText("1.300,0")).toBeTruthy();
    expect(within(april as HTMLElement).getByText("—")).toBeTruthy();
    // May: 1 200 + 400 + 100 = 1 700
    expect(within(may as HTMLElement).getByText("1.700,0")).toBeTruthy();
    // Overall total: 3 000 tCO₂e
    const total = within(table).getByText(/^total$/i).closest("tr");
    expect(within(total as HTMLElement).getByText("3.000,0")).toBeTruthy();
  });

  it("breaks emissions down by GHG scope with shares of the total", () => {
    render(<EnvironmentReportPage />);

    const breakdown = screen.getByRole("list", { name: /emisiones por alcance/i });
    const items = within(breakdown).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    // Scope 1 leads: 2 200 tCO₂e → 73,3 %
    expect(within(items[0]).getByText("Alcance 1")).toBeTruthy();
    expect(within(items[0]).getByText(/2\.200,0/)).toBeTruthy();
    expect(within(items[0]).getByText(/73,3/)).toBeTruthy();
    expect(within(items[1]).getByText("Alcance 2")).toBeTruthy();
    expect(within(items[2]).getByText("Alcance 3")).toBeTruthy();
  });

  it("breaks emissions down by source, largest emitter first", () => {
    render(<EnvironmentReportPage />);

    const breakdown = screen.getByRole("list", { name: /emisiones por fuente/i });
    const items = within(breakdown).getAllByRole("listitem");
    expect(within(items[0]).getByText("Combustión en bombas")).toBeTruthy();
    expect(within(items[1]).getByText("Energía eléctrica comprada")).toBeTruthy();
    expect(within(items[2]).getByText("Transporte contratado")).toBeTruthy();
  });

  it("shows the empty state when there are no emission entries", () => {
    useWorldStore.setState({
      world: { emissionEntries: [] } as unknown as PipelineWorld,
      loaded: true,
    });
    render(<EnvironmentReportPage />);
    expect(screen.getByText(/sin registros de emisiones/i)).toBeTruthy();
  });
});
