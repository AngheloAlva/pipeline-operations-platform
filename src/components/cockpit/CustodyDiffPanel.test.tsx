/**
 * TDD — RED tests for CustodyDiffPanel (MV-15).
 * Binational OTA↔OTC custody-difference panel: per-shipper table
 * (origin vs destination, diff m³/%, day/month/YTD) + waterfall.
 * Native assertions only (no jest-dom).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { CustodyDiffPanel } from "./CustodyDiffPanel";
import { makeCustodyDifference } from "@/lib/volumetrics/custody";
import { useSimulationStore, INITIAL_SLICE } from "@/store/simulationStore";
import type { CustodyDifference, Shipper } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SHIPPERS: Shipper[] = [
  { id: "SHP-A", name: "Petro Andes" },
  { id: "SHP-B", name: "Cuenca Sur" },
];

function record(
  id: string,
  period: string,
  shipperId: string,
  originVolM3: number,
  destVolM3: number,
): CustodyDifference {
  return makeCustodyDifference({ id, period, shipperId, originVolM3, destVolM3 });
}

/**
 * Monthly seed-shaped fixture. Latest month is 2026-06 (the anchor month,
 * since the test sim clock is epoch and falls back to the latest month):
 *   SHP-A 2026-06: 30 000 → 29 760  → −240 m³ / −0.80 % → warning
 *   SHP-B 2026-06: 20 000 → 19 700  → −300 m³ / −1.50 % → critical
 * YTD 2026 for SHP-A: 70 000 → 69 660 → −340 m³ / −0.4857 % → ok
 */
const RECORDS: CustodyDifference[] = [
  record("CD-1", "2026-05", "SHP-A", 40_000, 39_900),
  record("CD-2", "2026-05", "SHP-B", 25_000, 24_950),
  record("CD-3", "2026-06", "SHP-A", 30_000, 29_760),
  record("CD-4", "2026-06", "SHP-B", 20_000, 19_700),
];

const M3 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function renderPanel(records: CustodyDifference[] = RECORDS) {
  return render(<CustodyDiffPanel custodyDifferences={records} shippers={SHIPPERS} />);
}

function shipperRow(name: string): HTMLElement {
  const cell = screen.getByText(name);
  const row = cell.closest("tr");
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

beforeEach(() => {
  useSimulationStore.setState(INITIAL_SLICE);
});

// ---------------------------------------------------------------------------
// Table — per-shipper rows, coherent values, tolerance tones
// ---------------------------------------------------------------------------

describe("CustodyDiffPanel — table", () => {
  it("renders one row per shipper with origin, destination and difference for the anchor month", () => {
    renderPanel();

    const rowA = shipperRow("Petro Andes");
    expect(rowA.textContent).toContain(M3.format(30_000)); // origin OTA
    expect(rowA.textContent).toContain(M3.format(29_760)); // dest OTC
    expect(rowA.textContent).toContain(M3.format(-240)); // diff m³
    expect(rowA.textContent).toContain(PCT.format(-0.8)); // diff % (es-CL decimals)

    const rowB = shipperRow("Cuenca Sur");
    expect(rowB.textContent).toContain(M3.format(20_000));
    expect(rowB.textContent).toContain(M3.format(-300));
    expect(rowB.textContent).toContain(PCT.format(-1.5));
  });

  it("applies tolerance tones: within ±0.5 % ok, beyond warning/critical", () => {
    renderPanel();

    // Month view: −0.80 % → warning; −1.50 % → critical
    expect(shipperRow("Petro Andes").getAttribute("data-band")).toBe("warning");
    expect(shipperRow("Cuenca Sur").getAttribute("data-band")).toBe("critical");

    // YTD view: SHP-A total −0.4857 % → back inside tolerance → ok
    fireEvent.click(screen.getByRole("button", { name: "YTD" }));
    expect(shipperRow("Petro Andes").getAttribute("data-band")).toBe("ok");
  });

  it("renders a totals row that sums both shippers", () => {
    renderPanel();

    const total = shipperRow("Total");
    expect(total.textContent).toContain(M3.format(50_000));
    expect(total.textContent).toContain(M3.format(49_460));
    expect(total.textContent).toContain(M3.format(-540));
  });

  it("shows an empty state when there are no custody records", () => {
    renderPanel([]);
    expect(screen.getByText(/sin datos de custodia/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Period switch — day / month / YTD
// ---------------------------------------------------------------------------

describe("CustodyDiffPanel — period switch", () => {
  it("defaults to the month view with the anchor month visible", () => {
    renderPanel();

    const monthButton = screen.getByRole("button", { name: "Mes" });
    expect(monthButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/2026-06/).textContent).toBeTruthy();
  });

  it("switches to YTD and shows year-to-date totals per shipper", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "YTD" }));
    expect(screen.getByRole("button", { name: "YTD" }).getAttribute("aria-pressed")).toBe("true");

    const rowA = shipperRow("Petro Andes");
    expect(rowA.textContent).toContain(M3.format(70_000));
    expect(rowA.textContent).toContain(M3.format(-340));
  });

  it("switches to the day view and shows the monthly daily average (monthly seed)", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Día" }));
    expect(screen.getByRole("button", { name: "Día" }).getAttribute("aria-pressed")).toBe("true");

    // June has 30 days: 30 000 / 30 = 1 000 origin, diff −240 / 30 = −8
    const rowA = shipperRow("Petro Andes");
    expect(rowA.textContent).toContain(M3.format(1_000));
    expect(rowA.textContent).toContain(M3.format(-8));

    // Daily-average semantics are labeled honestly
    expect(screen.getByText(/promedio diario/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Waterfall — reuses WaterfallChart with custody entries
// ---------------------------------------------------------------------------

describe("CustodyDiffPanel — waterfall", () => {
  it("renders the custody waterfall section with its own heading", () => {
    renderPanel();

    const waterfall = screen.getByRole("region", { name: /descuadre por cargador/i });
    expect(waterfall).toBeTruthy();
    expect(within(waterfall).getByText("Descuadre por Cargador")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Report link — cross-nav to the full differences report (MV-18)
// ---------------------------------------------------------------------------

describe("CustodyDiffPanel — report link", () => {
  it("links to the full custody differences report", () => {
    renderPanel();

    const link = screen.getByRole("link", { name: /ver reporte completo/i });
    expect(link.getAttribute("href")).toBe("/reportes/diferencias");
  });
});
