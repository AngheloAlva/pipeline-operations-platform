/**
 * Tests for /reportes/allocation (MV-17) — per-shipper allocation of
 * received/delivered volumes from a fixture world: coherent numbers,
 * tolerance tones, and month switching.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import type { PipelineWorld } from "@/lib/domain";
import { makeCustodyDifference } from "@/lib/volumetrics/custody";
import { useWorldStore } from "@/store/worldStore";
import AllocationReportPage from "./page";

// ---------------------------------------------------------------------------
// Fixture world — only the slices this page consumes
// ---------------------------------------------------------------------------

const fixtureWorld = {
  shippers: [
    { id: "SHP-A", name: "Carga Norte" },
    { id: "SHP-B", name: "Carga Sur" },
  ],
  custodyDifferences: [
    // 2026-06 — A within tolerance (−0.5 %), B critical (−1.67 %)
    makeCustodyDifference({
      id: "CD-1",
      period: "2026-06",
      shipperId: "SHP-A",
      originVolM3: 40_000,
      destVolM3: 39_800,
    }),
    makeCustodyDifference({
      id: "CD-2",
      period: "2026-06",
      shipperId: "SHP-B",
      originVolM3: 60_000,
      destVolM3: 59_000,
    }),
    // 2026-05 — only A shipped
    makeCustodyDifference({
      id: "CD-3",
      period: "2026-05",
      shipperId: "SHP-A",
      originVolM3: 30_000,
      destVolM3: 30_000,
    }),
  ],
} as unknown as PipelineWorld;

beforeEach(() => {
  useWorldStore.setState({ world: fixtureWorld, loaded: true });
});

describe("AllocationReportPage — MV-17", () => {
  it("renders the report heading", () => {
    render(<AllocationReportPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /allocation por cargador/i }),
    ).toBeTruthy();
  });

  it("defaults to the latest month and shows coherent per-shipper numbers", () => {
    render(<AllocationReportPage />);

    const select = screen.getByLabelText("Mes") as HTMLSelectElement;
    expect(select.value).toBe("2026-06");

    const table = screen.getByRole("table");
    // Volumes (es-CL grouping)
    expect(within(table).getByText("39.800")).toBeTruthy();
    expect(within(table).getByText("59.000")).toBeTruthy();
    // Delivered shares of total OTC (98 800 m³): 40,3 % and 59,7 %
    expect(within(table).getByText("40,3%")).toBeTruthy();
    expect(within(table).getByText("59,7%")).toBeTruthy();
    // Totals row recomputed on the totals
    expect(within(table).getByText("100.000")).toBeTruthy();
    expect(within(table).getByText("98.800")).toBeTruthy();
  });

  it("tones each shipper row by its custody tolerance band", () => {
    render(<AllocationReportPage />);

    const table = screen.getByRole("table");
    const rowA = within(table).getByText("Carga Norte").closest("tr");
    const rowB = within(table).getByText("Carga Sur").closest("tr");
    expect(rowA?.getAttribute("data-band")).toBe("ok");
    expect(rowB?.getAttribute("data-band")).toBe("critical");
  });

  it("switches the view when another month is selected", () => {
    render(<AllocationReportPage />);

    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-05" } });

    const table = screen.getByRole("table");
    // Only Carga Norte shipped in 2026-05 — full share, zero difference
    expect(within(table).getByText("Carga Norte")).toBeTruthy();
    expect(within(table).queryByText("Carga Sur")).toBeNull();
    // "100,0%" appears for the shipper row AND the totals row
    expect(within(table).getAllByText("100,0%").length).toBeGreaterThanOrEqual(2);
    // 30 000 m³ appears as origin/destination for the row and the totals
    expect(within(table).getAllByText("30.000").length).toBeGreaterThanOrEqual(2);
  });
});
