/**
 * Tests for /reportes/diferencias (MV-18) — binational OTA↔OTC custody
 * differences per shipper from a fixture world: coherent numbers, tolerance
 * tones, month switching, and the YTD view.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import type { PipelineWorld } from "@/lib/domain";
import { makeCustodyDifference } from "@/lib/volumetrics/custody";
import { useWorldStore } from "@/store/worldStore";
import CustodyDifferencesReportPage from "./page";

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
    // 2026-05 — only A shipped, small gain
    makeCustodyDifference({
      id: "CD-3",
      period: "2026-05",
      shipperId: "SHP-A",
      originVolM3: 30_000,
      destVolM3: 30_100,
    }),
  ],
} as unknown as PipelineWorld;

beforeEach(() => {
  useWorldStore.setState({ world: fixtureWorld, loaded: true });
});

describe("CustodyDifferencesReportPage — MV-18", () => {
  it("renders the report heading", () => {
    render(<CustodyDifferencesReportPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /diferencias de custodia/i }),
    ).toBeTruthy();
  });

  it("defaults to the latest month with coherent per-shipper numbers and totals", () => {
    render(<CustodyDifferencesReportPage />);

    const select = screen.getByLabelText("Mes") as HTMLSelectElement;
    expect(select.value).toBe("2026-06");

    const table = screen.getByRole("table");
    // Origin / destination volumes (es-CL grouping)
    expect(within(table).getByText("39.800")).toBeTruthy();
    expect(within(table).getByText("59.000")).toBeTruthy();
    // Differences: −200 m³ / −0,50 % and −1.000 m³ / −1,67 %
    expect(within(table).getByText("-200")).toBeTruthy();
    expect(within(table).getByText("-0,50%")).toBeTruthy();
    expect(within(table).getByText("-1,67%")).toBeTruthy();
    // Totals recomputed on the totals: 100 000 → 98 800, −1 200 m³
    expect(within(table).getByText("100.000")).toBeTruthy();
    expect(within(table).getByText("98.800")).toBeTruthy();
    expect(within(table).getByText("-1.200")).toBeTruthy();
  });

  it("tones each shipper row by its custody tolerance band", () => {
    render(<CustodyDifferencesReportPage />);

    const table = screen.getByRole("table");
    const rowA = within(table).getByText("Carga Norte").closest("tr");
    const rowB = within(table).getByText("Carga Sur").closest("tr");
    expect(rowA?.getAttribute("data-band")).toBe("ok");
    expect(rowB?.getAttribute("data-band")).toBe("critical");
  });

  it("switches the view when another month is selected", () => {
    render(<CustodyDifferencesReportPage />);

    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-05" } });

    const table = screen.getByRole("table");
    // Only Carga Norte shipped in 2026-05
    expect(within(table).getByText("Carga Norte")).toBeTruthy();
    expect(within(table).queryByText("Carga Sur")).toBeNull();
    // 30 100 m³ appears as destination for the row and the totals
    expect(within(table).getAllByText("30.100").length).toBeGreaterThanOrEqual(2);
  });

  it("aggregates the year to date through the selected month in the YTD view", () => {
    render(<CustodyDifferencesReportPage />);

    fireEvent.click(screen.getByRole("button", { name: "YTD" }));

    const table = screen.getByRole("table");
    // SHP-A YTD 2026: 70 000 → 69 900; totals 130 000 → 128 900
    expect(within(table).getByText("69.900")).toBeTruthy();
    expect(within(table).getByText("130.000")).toBeTruthy();
    expect(within(table).getByText("128.900")).toBeTruthy();
  });

  it("shows the empty state when there are no custody records", () => {
    useWorldStore.setState({
      world: { shippers: [], custodyDifferences: [] } as unknown as PipelineWorld,
      loaded: true,
    });
    render(<CustodyDifferencesReportPage />);
    expect(screen.getByText(/sin datos de custodia/i)).toBeTruthy();
  });
});
