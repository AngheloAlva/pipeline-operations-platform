/**
 * Tests for ReportNav (MV-33) — the reports module stepper: a back link to the
 * /reportes index plus previous/next controls that walk the report catalog and
 * wrap around at both ends.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock next/navigation — ReportNav needs usePathname
// ---------------------------------------------------------------------------

const usePathnameMock = vi.fn(() => "/reportes/allocation");

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { ReportNav } from "./ReportNav";

describe("ReportNav — report stepper (MV-33)", () => {
  it("renders nothing on the reports index", () => {
    usePathnameMock.mockReturnValue("/reportes");
    const { container } = render(<ReportNav />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a back link to the report index on a report page", () => {
    usePathnameMock.mockReturnValue("/reportes/allocation");
    render(<ReportNav />);
    const back = screen.getByRole("link", { name: /volver a reportes/i });
    expect(back.getAttribute("href")).toBe("/reportes");
  });

  it("steps to the adjacent reports in catalog order", () => {
    usePathnameMock.mockReturnValue("/reportes/presupuesto"); // index 1 of 6
    render(<ReportNav />);
    expect(
      screen.getByRole("link", { name: /reporte anterior/i }).getAttribute("href"),
    ).toBe("/reportes/allocation");
    expect(
      screen.getByRole("link", { name: /reporte siguiente/i }).getAttribute("href"),
    ).toBe("/reportes/diferencias");
  });

  it("wraps around at both ends of the catalog", () => {
    // Previous of the first report wraps to the last (Cierres).
    usePathnameMock.mockReturnValue("/reportes/allocation");
    const { rerender } = render(<ReportNav />);
    expect(
      screen.getByRole("link", { name: /reporte anterior/i }).getAttribute("href"),
    ).toBe("/reportes/cierres");

    // Next of the last report wraps to the first (Allocation).
    usePathnameMock.mockReturnValue("/reportes/cierres");
    rerender(<ReportNav />);
    expect(
      screen.getByRole("link", { name: /reporte siguiente/i }).getAttribute("href"),
    ).toBe("/reportes/allocation");
  });
});
